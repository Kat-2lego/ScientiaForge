"""
SkillForge Career Discovery - FastAPI application.

Routes are thin: they validate, delegate to profile_builder / matching_engine,
and format. No scoring logic lives here (§55).

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import statistics
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import career_repository
import config
import mappings
import matching_engine as engine
import profile_builder
import question_bank
import user_data
import validators
from database import DatabaseError
from schemas import (
    CareerSearchRequest,
    CareerSuggestion,
    MatchResponse,
    QuestionnairePayload,
    QuestionnaireRequest,
    QuestionnaireResponse,
    SaveCareerRequest,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("skillforge.api")

# Say out loud which .env was used and whether it defines a key twice: with
# more than one Supabase project in one file, a silent first-wins is a trap.
if config._loaded_from:
    logger.info("Loaded environment from %s", config._loaded_from[0])
else:
    logger.warning(
        "No .env found. Set SKILLFORGE_DOTENV to its full path, or export the "
        "variables in your shell."
    )
if config._duplicate_keys:
    logger.warning(
        "These keys appear more than once in .env; the FIRST value wins: %s",
        ", ".join(sorted(config._duplicate_keys)),
    )
if config.SUPABASE_URL.rstrip("/").endswith("/rest/v1"):
    logger.warning(
        "SUPABASE_URL should be https://<ref>.supabase.co with no /rest/v1 "
        "suffix; PostgREST writes will 404 with PGRST125."
    )

app = FastAPI(title="SkillForge Career Discovery API", version="2.0.0")

# CORS is configured for the real development origin. Note that an internal
# error still returns through this middleware, so a 500 always carries CORS
# headers and never masquerades as a CORS failure in the browser (§41).
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warm_cache_on_startup() -> None:
    """Start building the O*NET cache the moment the process boots.

    Without this, the person who happens to submit the questionnaire first
    after a deploy (or after a free-tier instance spins back up) is the one
    who pays for the cold build. A background thread means uvicorn still
    starts accepting connections — and passes its health check — right away;
    it does not block startup, it just means the warm-up is already under way
    before any real request needs it.
    """
    def _build() -> None:
        try:
            cache = career_repository.get_cache()
            logger.info(
                "Startup cache warm-up finished: %d occupations", len(cache.occupations)
            )
        except DatabaseError as exc:
            # Not fatal: the first real request will simply try again and
            # surface the DATABASE_ERROR normally.
            logger.warning("Startup cache warm-up failed, will retry on request: %s", exc)

    threading.Thread(target=_build, name="onet-cache-warmup", daemon=True).start()


# ---------------------------------------------------------------------------
# Error handling (§40)
# ---------------------------------------------------------------------------

def _error_response(code: str, message: str, status: int, details: Optional[Dict[str, Any]] = None):
    body: Dict[str, Any] = {"error": True, "code": code, "message": message}
    if details:
        body["details"] = details
    return JSONResponse(status_code=status, content=body)


@app.exception_handler(validators.AppError)
async def handle_app_error(_: Request, exc: validators.AppError):
    logger.warning("%s: %s", exc.code, exc.public_message)
    return _error_response(exc.code, exc.public_message, exc.status, exc.details)


@app.exception_handler(DatabaseError)
async def handle_database_error(_: Request, exc: DatabaseError):
    # The technical detail is logged; the browser only sees a safe message.
    logger.error("Database failure: %s", exc, exc_info=True)
    return _error_response(
        "DATABASE_ERROR",
        "Career data could not be loaded. Please try again shortly.",
        503,
    )


@app.exception_handler(Exception)
async def handle_unexpected(_: Request, exc: Exception):
    logger.exception("Unhandled server error")
    return _error_response(
        "SERVER_ERROR",
        "An unexpected error occurred while generating your matches.",
        500,
    )


def _bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


# ---------------------------------------------------------------------------
# Matching jobs
#
# generate-matches used to block the request for as long as the match took,
# which meant a cold cache (first request after a deploy or a free-tier
# spin-down) could hold a browser connection open for minutes, and a user who
# navigated away mid-request lost everything. POST now only *starts* the job
# and returns a job_id straight away; the actual work runs in a background
# thread and the frontend polls GET .../generate-matches/{job_id} for the
# result. The job itself still comes from the same in-memory cache, so this
# is purely about not holding the HTTP request open — it does not change the
# matching logic at all (§55).
# ---------------------------------------------------------------------------

JOB_TTL_SECONDS = 30 * 60  # stop answering for a job id older than this

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()


def _prune_jobs_locked() -> None:
    cutoff = time.time() - JOB_TTL_SECONDS
    stale = [job_id for job_id, job in _jobs.items() if job["created_at"] < cutoff]
    for job_id in stale:
        del _jobs[job_id]


def _create_job() -> str:
    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _prune_jobs_locked()
        _jobs[job_id] = {
            "status": "processing",
            "created_at": time.time(),
            "result": None,
            "error": None,
        }
    return job_id


def _get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return dict(job) if job is not None else None


def _complete_job(job_id: str, result: Dict[str, Any]) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id]["status"] = "completed"
            _jobs[job_id]["result"] = result


def _fail_job(job_id: str, code: str, message: str, status: int) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = {"code": code, "message": message, "status": status}


def _run_matching_job(
    job_id: str, payload: QuestionnairePayload, access_token: Optional[str]
) -> None:
    try:
        response = _build_match_response(payload, access_token)
        _complete_job(job_id, response.model_dump())
    except validators.AppError as exc:
        logger.warning("Job %s: %s", job_id, exc.code)
        _fail_job(job_id, exc.code, exc.public_message, exc.status)
    except DatabaseError as exc:
        logger.error("Job %s: database failure: %s", job_id, exc, exc_info=True)
        _fail_job(
            job_id,
            "DATABASE_ERROR",
            "Career data could not be loaded. Please try again shortly.",
            503,
        )
    except Exception:
        logger.exception("Job %s: unhandled error", job_id)
        _fail_job(
            job_id,
            "SERVER_ERROR",
            "An unexpected error occurred while generating your matches.",
            500,
        )


# ---------------------------------------------------------------------------
# Metadata routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> Dict[str, Any]:
    try:
        cache = career_repository.get_cache()
        return {
            "status": "ok",
            "occupations": len(cache.occupations),
            "scales_used": cache.scales_used,
            "cache_warnings": len(cache.warnings),
        }
    except DatabaseError as exc:
        return {"status": "degraded", "detail": str(exc)[:200]}


@app.get("/api/discovery/options")
def discovery_options() -> Dict[str, Any]:
    """Domains, backgrounds and school subjects the UI should render (§39)."""
    return {
        "domains": [
            {"value": key, "label": mappings.DOMAIN_LABELS[key]}
            for key in mappings.DOMAIN_KEYS
        ],
        "academic_background": [
            {"value": key, "label": label}
            for key, label in mappings.BACKGROUND_LABELS.items()
        ],
        "school_subjects": [
            {"value": key, "label": label}
            for key, label in mappings.SCHOOL_SUBJECT_LABELS.items()
        ],
        "max_domains": 3,
    }


@app.get("/api/discovery/validate-database")
def validate_database() -> Dict[str, Any]:
    """§38/§59 - run this once after migrating O*NET into Supabase."""
    return career_repository.validate_database()


@app.post("/api/discovery/questionnaire", response_model=QuestionnaireResponse)
def get_questionnaire(request: QuestionnaireRequest) -> QuestionnaireResponse:
    """Serve the generated question set for this configuration (§6)."""
    domains, _ = validators.validate_domains(request.core_domains)
    questions = question_bank.build_question_set(domains, request.deep_scan_enabled)
    return QuestionnaireResponse(
        questions=[
            {
                "question_id": q["question_id"],
                "text": q["text"],
                "section": q["section"],
                "domain": q.get("domain"),
                "deep_scan": q.get("deep_scan", False),
                "options": [
                    {"option_id": o["option_id"], "text": o["text"]}
                    for o in q["options"]
                ],
            }
            for q in questions
        ],
        total=len(questions),
        deep_scan_enabled=request.deep_scan_enabled,
        domains=domains,
    )


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def _build_match_response(
    payload: QuestionnairePayload, access_token: Optional[str]
) -> MatchResponse:
    """The actual matching work (§55). Called from the background job runner."""
    warnings: List[str] = []

    domains, domain_warnings = validators.validate_domains(payload.core_domains)
    background, background_warnings = validators.validate_background(payload.academic_background)
    subjects, subject_warnings = validators.validate_school_subjects(payload.school_subjects)
    answers, answer_warnings = validators.validate_answers(
        [a.model_dump() for a in payload.questionnaire_answers],
        domains,
        payload.deep_scan_enabled,
    )
    warnings.extend(domain_warnings + background_warnings + subject_warnings + answer_warnings)

    cache = career_repository.get_cache()
    if not cache.occupations:
        raise validators.NoCandidatesError()

    profile = profile_builder.build_user_profile(
        core_domains=domains,
        academic_background=background,
        school_subjects=subjects,
        deep_scan_enabled=payload.deep_scan_enabled,
        answers=answers,
        valid_element_ids=set(cache.element_names.keys()),
    )
    if profile.unknown_answers:
        warnings.append(f"{len(profile.unknown_answers)} answers were not recognised.")

    selection, ranked, threshold, note = engine.build_ranked_results(
        profile, cache, config.RESULT_COUNT
    )
    if not selection:
        raise validators.NoCandidatesError()

    engine.assign_groups(selection)
    median_raw = statistics.median([s.raw_score for s in ranked]) if ranked else 0.0

    matches = [
        engine.serialise_career(scored, profile, cache, median_raw)
        for scored in selection
    ]

    related = engine.load_related_careers(
        selection, profile, cache, exclude=[s.code for s in selection]
    )
    related_payload = [
        engine.serialise_career(scored, profile, cache, median_raw) for scored in related
    ]

    summary = profile_builder.profile_summary(profile)

    session_id: Optional[str] = None
    session_saved = False
    if payload.persist:
        try:
            session_id = user_data.save_discovery_session(
                profile_summary=summary,
                core_domains=domains,
                academic_background=background,
                school_subjects=subjects,
                deep_scan_enabled=payload.deep_scan_enabled,
                answers=answers,
                results=matches,
                fingerprint=profile.fingerprint,
                access_token=access_token,
            )
            session_saved = session_id is not None
        except validators.AppError as exc:
            # Persistence is best-effort: the recommendation itself is still
            # valid, but we say so rather than pretending it was stored.
            warnings.append(f"Session was not saved ({exc.code}).")

    return MatchResponse(
        session_id=session_id,
        profile=summary,
        matches=[CareerSuggestion(**m) for m in matches],
        related_careers=[CareerSuggestion(**m) for m in related_payload],
        result_note=note,
        relevance_threshold_used=threshold,
        candidates_considered=len(ranked),
        session_saved=session_saved,
        warnings=warnings,
    )


@app.post("/api/discovery/generate-matches")
def generate_career_matches(
    payload: QuestionnairePayload,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """Start a match job and return immediately (§55).

    The browser used to hold this connection open for as long as the match
    took — several minutes on a cold cache. It now gets a job_id straight
    away and polls GET .../generate-matches/{job_id}, so a slow first run
    never looks like a dead request, and a user who navigates away and comes
    back can resume watching the same job instead of starting over.
    """
    job_id = _create_job()
    background_tasks.add_task(
        _run_matching_job, job_id, payload, _bearer(authorization)
    )
    return {"job_id": job_id, "status": "processing"}


@app.get("/api/discovery/generate-matches/{job_id}")
def get_match_job(job_id: str) -> Dict[str, Any]:
    job = _get_job(job_id)
    if job is None:
        raise validators.ValidationError(
            "That job has expired or does not exist. Please run the questionnaire again.",
            {"job_id": job_id},
        )

    if job["status"] == "processing":
        return {"job_id": job_id, "status": "processing"}

    if job["status"] == "failed":
        error = job["error"] or {}
        return _error_response(
            error.get("code", "SERVER_ERROR"),
            error.get("message", "Something went wrong while generating your matches."),
            error.get("status", 500),
        )

    return {"job_id": job_id, "status": "completed", "result": job["result"]}


# ---------------------------------------------------------------------------
# Saved careers (§31)
# ---------------------------------------------------------------------------

@app.post("/api/discovery/save-career")
def save_career(
    request: SaveCareerRequest,
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    token = _bearer(authorization)
    if not token:
        raise validators.AuthRequiredError()

    cache = career_repository.get_cache()
    if request.onetsoc_code not in cache.occupations:
        raise validators.ValidationError(
            "That occupation code is not in the career database.",
            {"onetsoc_code": request.onetsoc_code},
        )

    saved = user_data.save_career(
        onetsoc_code=request.onetsoc_code,
        session_id=request.session_id,
        notes=request.notes,
        access_token=token,
    )
    occupation = cache.occupations[request.onetsoc_code]
    return {"saved": True, "record": saved, "title": occupation.title}


@app.get("/api/discovery/saved-careers")
def get_saved_careers(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    token = _bearer(authorization)
    if not token:
        raise validators.AuthRequiredError()

    cache = career_repository.get_cache()
    rows = user_data.list_saved_careers(token)
    for row in rows:
        occupation = cache.occupations.get(row.get("onetsoc_code", ""))
        if occupation:
            row["title"] = occupation.title
            row["job_zone"] = occupation.job_zone
            row["image_url"] = engine.resolve_image(occupation)
    return {"saved_careers": rows}


# ---------------------------------------------------------------------------
# Learning path seed (§32)
# ---------------------------------------------------------------------------

@app.post("/api/discovery/search")
def search_careers(payload: CareerSearchRequest) -> Dict[str, Any]:
    """Look a career up by name.

    Discovery should not be the only way in: someone who already knows they
    want "actuary" should be able to type it. When the caller includes their
    questionnaire answers the results carry a real match score from the same
    engine, so search and recommendation never disagree.
    """
    cache = career_repository.get_cache()
    if not cache.occupations:
        raise validators.NoCandidatesError()

    codes = career_repository.search_occupations(cache, payload.query, payload.limit)
    if not codes:
        return {"query": payload.query, "count": 0, "scored": False, "results": []}

    # Domains are optional here: search must work before the user has chosen
    # anything. validate_domains rejects an empty list, which is right for the
    # questionnaire and wrong for this route.
    domains: List[str] = []
    if payload.core_domains:
        domains, _ = validators.validate_domains(payload.core_domains)

    answers: List[Dict[str, Any]] = []
    if payload.questionnaire_answers:
        answers, _ = validators.validate_answers(
            [a.model_dump() for a in payload.questionnaire_answers],
            domains,
            payload.deep_scan_enabled,
        )

    # No answers means no profile, and no profile means no match score. We
    # return the careers with match_score null rather than inventing one.
    if not answers:
        results = [
            {
                "onetsoc_code": code,
                "title": cache.occupations[code].title,
                "description": cache.occupations[code].description,
                "job_zone": cache.occupations[code].job_zone,
                "job_zone_label": config.JOB_ZONE_LABELS.get(
                    cache.occupations[code].job_zone, ""
                ),
                "match_score": None,
                "confidence": None,
            }
            for code in codes
        ]
        return {
            "query": payload.query,
            "count": len(results),
            "scored": False,
            "note": "Complete the questionnaire to see how these fit you.",
            "results": results,
        }

    background, _ = validators.validate_background(payload.academic_background)
    subjects, _ = validators.validate_school_subjects(payload.school_subjects)

    profile = profile_builder.build_user_profile(
        core_domains=domains,
        academic_background=background,
        school_subjects=subjects,
        deep_scan_enabled=payload.deep_scan_enabled,
        answers=answers,
        valid_element_ids=set(cache.element_names.keys()),
    )

    # Score the whole space so the percentile context (and therefore the
    # confidence margin) is the same one the recommendations used.
    all_scored = engine.score_all(profile, cache)
    median_raw = (
        statistics.median([s.raw_score for s in all_scored]) if all_scored else 0.0
    )
    by_code = {s.code: s for s in all_scored}

    results = []
    for code in codes:
        scored = by_code.get(code)
        if scored is None:
            continue
        results.append(engine.serialise_career(scored, profile, cache, median_raw))

    return {
        "query": payload.query,
        "count": len(results),
        "scored": True,
        "results": results,
    }


@app.get("/api/discovery/occupation/{onetsoc_code}")
def occupation_detail(onetsoc_code: str) -> Dict[str, Any]:
    """Everything Start Learning needs, driven by the selected occupation."""
    cache = career_repository.get_cache()
    occupation = cache.occupations.get(onetsoc_code)
    if occupation is None:
        raise validators.ValidationError(
            "Unknown occupation code.", {"onetsoc_code": onetsoc_code}
        )

    def top_elements(table: str, limit: int = 6) -> List[Dict[str, Any]]:
        features = occupation.features.get(table, {})
        ranked = sorted(features.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
        return [
            {
                "element_id": element_id,
                "name": cache.element_name(element_id),
                "percentile": round(percentile * 100),
            }
            for element_id, percentile in ranked
        ]

    return {
        "onetsoc_code": occupation.code,
        "title": occupation.title,
        "description": occupation.description,
        "job_zone": occupation.job_zone,
        "job_zone_label": config.JOB_ZONE_LABELS.get(occupation.job_zone or 0, "Unknown"),
        "salary": engine.salary_estimate(occupation),
        "salary_is_estimate": True,
        "salary_note": config.SALARY_DISCLAIMER,
        "image_url": engine.resolve_image(occupation),
        "technologies": engine.select_tech_skills(occupation),
        "technology_demand": engine.technology_demand_label(occupation),
        "top_skills": top_elements("skillss"),
        "top_knowledge": top_elements("knowledge"),
        "top_work_activities": top_elements("work_activities"),
        "top_abilities": top_elements("abilities"),
        "related": [
            {
                "onetsoc_code": code,
                "title": cache.occupations[code].title,
                "tier": tier,
            }
            for code, tier, _index in cache.related.get(occupation.code, [])[:6]
            if code in cache.occupations
        ],
    }
