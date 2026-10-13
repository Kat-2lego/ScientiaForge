"""
SkillForge Career Discovery - user profile construction.

Turns (domains, background, school subjects, answers) into a UserProfile: a set
of weighted O*NET element vectors plus a domain weighting. Nothing here touches
the database, which makes every function trivially testable (§55, §57).
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import config
import mappings
import question_bank

logger = logging.getLogger("skillforge.profile")

VECTOR_TABLES = ("interests", "knowledge", "skills", "abilities",
                 "work_activities", "work_styles")


@dataclass
class UserProfile:
    """Everything the engine compares against O*NET."""

    domain_profile: Dict[str, float] = field(default_factory=dict)
    # table -> element_id -> weight in 0..1
    vectors: Dict[str, Dict[str, float]] = field(default_factory=dict)
    # academic background + school subjects, same shape as `vectors`
    background_vectors: Dict[str, Dict[str, float]] = field(default_factory=dict)
    technology_profile: Dict[str, float] = field(default_factory=dict)
    riasec: Dict[str, float] = field(default_factory=dict)
    personality: Dict[str, float] = field(default_factory=dict)
    target_job_zone: int = config.DEFAULT_TARGET_JOB_ZONE
    selected_domains: List[str] = field(default_factory=list)
    academic_background: List[str] = field(default_factory=list)
    school_subjects: List[str] = field(default_factory=list)
    deep_scan_enabled: bool = False
    answered_count: int = 0
    unknown_answers: List[str] = field(default_factory=list)
    fingerprint: str = ""

    def vector(self, table: str) -> Dict[str, float]:
        return self.vectors.get(table, {})

    def richness(self) -> float:
        """0..1 - how much evidence the user actually gave us."""
        answer_term = min(
            1.0, self.answered_count / config.PROFILE_RICHNESS_TARGET_ANSWERS
        )
        extras = 0.0
        if self.academic_background:
            extras += 0.5
        if self.school_subjects:
            extras += 0.25
        if self.deep_scan_enabled:
            extras += 0.25
        return max(0.0, min(1.0, 0.7 * answer_term + 0.3 * min(1.0, extras)))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _accumulate(target: Dict[str, float], additions: Dict[str, float], factor: float = 1.0) -> None:
    for key, value in additions.items():
        target[key] = target.get(key, 0.0) + float(value) * factor


def _normalise(vector: Dict[str, float]) -> Dict[str, float]:
    """Scale so the largest weight is 1.0, keeping the relative shape."""
    if not vector:
        return {}
    peak = max(vector.values())
    if peak <= 0:
        return {}
    return {k: max(0.0, v / peak) for k, v in vector.items()}


def _normalise_to_sum(vector: Dict[str, float]) -> Dict[str, float]:
    total = sum(v for v in vector.values() if v > 0)
    if total <= 0:
        return {}
    return {k: v / total for k, v in vector.items() if v > 0}


def _merge_profile_map(
    target: Dict[str, Dict[str, float]],
    profile: Dict[str, Dict[str, float]],
    factor: float = 1.0,
) -> None:
    for table, elements in profile.items():
        _accumulate(target.setdefault(table, {}), elements, factor)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_user_profile(
    core_domains: List[str],
    academic_background: List[str],
    school_subjects: List[str],
    deep_scan_enabled: bool,
    answers: List[Dict[str, str]],
    valid_element_ids: Optional[set] = None,
) -> UserProfile:
    """Construct the weighted profile vector described in §12."""

    selected_domains = [d for d in core_domains if d in mappings.DOMAIN_KEYS]
    profile = UserProfile(
        selected_domains=selected_domains,
        academic_background=[b for b in academic_background if b in mappings.BACKGROUND_PROFILES],
        school_subjects=[s for s in school_subjects if s in mappings.SCHOOL_SUBJECT_PROFILES],
        deep_scan_enabled=deep_scan_enabled,
    )

    raw_domains: Dict[str, float] = {
        d: config.SELECTED_DOMAIN_SEED for d in selected_domains
    }
    raw_vectors: Dict[str, Dict[str, float]] = {t: {} for t in VECTOR_TABLES}
    raw_tech: Dict[str, float] = {}
    personality_raw: Dict[str, float] = {}
    job_zone_votes: List[int] = []

    # --- questionnaire answers --------------------------------------------
    for answer in answers:
        question_id = answer.get("question_id", "")
        option_id = answer.get("option_id", "")
        option = question_bank.lookup_option(question_id, option_id)
        if option is None:
            profile.unknown_answers.append(f"{question_id}:{option_id}")
            continue

        profile.answered_count += 1
        question = question_bank.QUESTION_INDEX[question_id]
        effects = option["effects"]

        _accumulate(raw_domains, effects.get("domains", {}))
        for table in VECTOR_TABLES:
            _accumulate(raw_vectors[table], effects.get(table, {}))
        _accumulate(raw_tech, effects.get("technology", {}))
        if "job_zone" in effects:
            job_zone_votes.append(int(effects["job_zone"]))

        # Deep-scan answers additionally feed the personality read-out. A
        # personality trait is only ever recorded because an answer produced it
        # (§9) - nothing is invented from the domain selection.
        if question.get("deep_scan"):
            for trait, spec in mappings.PERSONALITY_DIMENSIONS.items():
                weight = effects.get(spec["table"], {}).get(spec["element"], 0.0)
                if weight:
                    personality_raw[trait] = personality_raw.get(trait, 0.0) + float(weight)

    # --- academic background + school subjects (§8, §26) -------------------
    background_raw: Dict[str, Dict[str, float]] = {}
    for background in profile.academic_background:
        _merge_profile_map(background_raw, mappings.BACKGROUND_PROFILES[background])
    for subject in profile.school_subjects:
        _merge_profile_map(
            background_raw,
            mappings.SCHOOL_SUBJECT_PROFILES[subject],
            mappings.SCHOOL_SUBJECT_WEIGHT,
        )

    # School subjects and qualifications are genuine evidence about ability and
    # knowledge, so they also contribute (at half strength) to the main
    # matching vectors - as a signal, never as a filter.
    for table, elements in background_raw.items():
        if table in raw_vectors:
            _accumulate(raw_vectors[table], elements, 0.5)

    # --- drop mappings the database cannot support -------------------------
    if valid_element_ids is not None:
        for table in list(raw_vectors):
            raw_vectors[table] = {
                k: v for k, v in raw_vectors[table].items() if k in valid_element_ids
            }
        for table in list(background_raw):
            background_raw[table] = {
                k: v for k, v in background_raw[table].items() if k in valid_element_ids
            }

    # --- finalise ----------------------------------------------------------
    # The user's own domain selection stays dominant: domains they did not pick
    # can still surface through their answers, but at damped strength (§5, §15).
    for domain in list(raw_domains):
        if domain not in selected_domains:
            raw_domains[domain] *= config.UNSELECTED_DOMAIN_DAMPING

    profile.domain_profile = _normalise_to_sum(raw_domains) or {
        d: 1.0 / max(1, len(selected_domains)) for d in selected_domains
    }
    profile.vectors = {t: _normalise(v) for t, v in raw_vectors.items()}
    profile.background_vectors = {t: _normalise(v) for t, v in background_raw.items()}
    profile.technology_profile = _normalise_to_sum(raw_tech) or dict(profile.domain_profile)

    interests_vector = profile.vectors.get("interests", {})
    profile.riasec = {
        name: round(interests_vector.get(element_id, 0.0), 4)
        for name, element_id in mappings.RIASEC_ELEMENTS.items()
    }
    profile.personality = _normalise(personality_raw)

    if job_zone_votes:
        profile.target_job_zone = round(sum(job_zone_votes) / len(job_zone_votes))
    elif profile.academic_background:
        zones = [
            config.BACKGROUND_TARGET_JOB_ZONE.get(b, config.DEFAULT_TARGET_JOB_ZONE)
            for b in profile.academic_background
        ]
        profile.target_job_zone = round(sum(zones) / len(zones))
    profile.target_job_zone = max(1, min(5, profile.target_job_zone))

    profile.fingerprint = fingerprint_inputs(
        selected_domains, profile.academic_background, profile.school_subjects,
        deep_scan_enabled, answers,
    )
    return profile


def fingerprint_inputs(
    domains: List[str],
    background: List[str],
    subjects: List[str],
    deep_scan: bool,
    answers: List[Dict[str, str]],
) -> str:
    """Stable hash of the inputs - identical questionnaires hash identically (§35)."""
    payload = {
        "domains": sorted(domains),
        "background": sorted(background),
        "subjects": sorted(subjects),
        "deep_scan": bool(deep_scan),
        "answers": sorted(
            f"{a.get('question_id')}:{a.get('option_id')}" for a in answers
        ),
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:32]


def pool_domains(profile: UserProfile) -> List[str]:
    """Domains strong enough to widen the candidate search space (§5, §15)."""
    # A domain the user chose always defines part of the search space, however
    # their answers went. An unselected domain joins it only once the answers
    # give it real weight.
    domains = list(profile.selected_domains)
    for domain, weight in profile.domain_profile.items():
        if domain not in domains and weight >= config.POOL_DOMAIN_MIN_WEIGHT:
            domains.append(domain)
    return domains or list(profile.domain_profile)


def dominant_domains(profile: UserProfile, limit: int = 3) -> List[Tuple[str, float]]:
    return sorted(profile.domain_profile.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]


def profile_headline(profile: UserProfile) -> str:
    """The 'Your strongest career direction is ...' line (§62)."""
    ranked = dominant_domains(profile, 2)
    if not ranked:
        return "Your career direction"
    labels = [mappings.DOMAIN_LABELS.get(d, d.title()) for d, _ in ranked]
    if len(ranked) == 1 or ranked[1][1] < ranked[0][1] * 0.55:
        return labels[0]
    return f"{labels[0]} + {labels[1]}"


def profile_summary(profile: UserProfile) -> Dict[str, Any]:
    """Serialisable view returned to the frontend under `profile` (§50)."""
    return {
        "dominant_domains": [
            {"domain": d, "label": mappings.DOMAIN_LABELS.get(d, d), "weight": round(w, 3)}
            for d, w in dominant_domains(profile, 3)
        ],
        "headline": profile_headline(profile),
        "riasec": {k: round(v * 100) for k, v in profile.riasec.items()},
        "personality": {k: round(v * 100) for k, v in profile.personality.items()},
        "work_styles": {k: round(v, 3) for k, v in profile.vector("work_styles").items()},
        "target_job_zone": profile.target_job_zone,
        "academic_background": profile.academic_background,
        "school_subjects": profile.school_subjects,
        "deep_scan_enabled": profile.deep_scan_enabled,
        "answers_used": profile.answered_count,
        "profile_fingerprint": profile.fingerprint,
    }
