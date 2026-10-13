"""
SkillForge Career Discovery - application tables (sessions, saved careers).

These calls go through Supabase PostgREST with the *caller's* JWT whenever one
is supplied, so Row Level Security decides what may be read or written (§31,
§33). The service-role key is only used for anonymous session logging, and even
then it writes user_id = NULL rather than impersonating anybody.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

import httpx

import config
from validators import AppError, AuthRequiredError

logger = logging.getLogger("skillforge.user_data")


class PersistenceUnavailable(AppError):
    code = "PERSISTENCE_UNAVAILABLE"
    status = 503
    message = "Saving is temporarily unavailable."


def _rest_base() -> str:
    if not config.SUPABASE_URL:
        raise PersistenceUnavailable("SUPABASE_URL is not configured.")
    return config.SUPABASE_URL.rstrip("/") + "/rest/v1"


def _headers(access_token: Optional[str]) -> Dict[str, str]:
    key = config.SUPABASE_ANON_KEY or config.SUPABASE_SERVICE_KEY
    if not key:
        raise PersistenceUnavailable("No Supabase API key is configured.")
    token = access_token or config.SUPABASE_SERVICE_KEY or key
    return {
        "apikey": key,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _post(table: str, rows: List[Dict[str, Any]], access_token: Optional[str]) -> List[Dict[str, Any]]:
    try:
        with httpx.Client(timeout=20) as client:
            response = client.post(
                f"{_rest_base()}/{table}",
                headers=_headers(access_token),
                content=json.dumps(rows, default=str),
            )
    except httpx.HTTPError as exc:
        logger.warning("PostgREST write to %s failed: %s", table, exc)
        raise PersistenceUnavailable() from exc

    if response.status_code in (401, 403):
        raise AuthRequiredError("You need to be signed in to do that.")
    if response.status_code >= 400:
        logger.warning("PostgREST %s -> %s: %s", table, response.status_code, response.text[:300])
        raise PersistenceUnavailable()
    try:
        return response.json()
    except ValueError:
        return []


def save_discovery_session(
    *,
    profile_summary: Dict[str, Any],
    core_domains: List[str],
    academic_background: List[str],
    school_subjects: List[str],
    deep_scan_enabled: bool,
    answers: List[Dict[str, str]],
    results: List[Dict[str, Any]],
    fingerprint: str,
    access_token: Optional[str],
) -> Optional[str]:
    """Record an auditable session (§34). Failure is reported, never fatal."""
    row = {
        "core_domains": core_domains,
        "academic_background": academic_background,
        "school_subjects": school_subjects,
        "deep_scan_enabled": deep_scan_enabled,
        "answers": answers,
        "calculated_profile": profile_summary,
        "profile_fingerprint": fingerprint,
        "results": [
            {
                "onetsoc_code": r["onetsoc_code"],
                "title": r["title"],
                "match_score": r["match_score"],
                "group": r["group"],
            }
            for r in results
        ],
    }
    created = _post("discovery_sessions", [row], access_token)
    if created:
        return created[0].get("id")
    return None


def save_career(
    *, onetsoc_code: str, session_id: Optional[str], notes: Optional[str], access_token: str
) -> Dict[str, Any]:
    """Save a career for the signed-in user. RLS enforces ownership (§31)."""
    if not access_token:
        raise AuthRequiredError()
    rows = _post(
        "saved_careers",
        [{"onetsoc_code": onetsoc_code, "session_id": session_id, "notes": notes}],
        access_token,
    )
    return rows[0] if rows else {}


def list_saved_careers(access_token: str) -> List[Dict[str, Any]]:
    if not access_token:
        raise AuthRequiredError()
    try:
        with httpx.Client(timeout=20) as client:
            response = client.get(
                f"{_rest_base()}/saved_careers",
                headers=_headers(access_token),
                params={"select": "*", "order": "saved_at.desc"},
            )
    except httpx.HTTPError as exc:
        raise PersistenceUnavailable() from exc

    if response.status_code in (401, 403):
        raise AuthRequiredError()
    if response.status_code >= 400:
        raise PersistenceUnavailable()
    return response.json()
