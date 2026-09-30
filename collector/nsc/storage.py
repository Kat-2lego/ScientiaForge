"""A tiny Supabase client built on `requests` (no supabase-py needed).

Only three things are needed by the collector:
  * read which papers already exist           (PostgREST select, paged)
  * store the PDFs                            (Storage upload, upsert)
  * write a paper + questions + memo answers  (RPC nsc_ingest_paper, atomic)

Keys: both the legacy service_role JWT ("eyJ...") and the newer
"sb_secret_..." keys work. The new keys must only be sent in the `apikey`
header, so `Authorization: Bearer` is added for JWT keys only.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Optional
from urllib.parse import quote

import requests

log = logging.getLogger("nsc")


class SupabaseError(RuntimeError):
    pass


def _slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_") or "Unknown"


def storage_paths(
    year: int, session: str, subject: str, paper_number: int, grade: int = 12, language: str = "English"
) -> tuple[str, str]:
    """Paths *inside* the bucket, e.g. NSC/2024/November/Mathematics/Paper_1.pdf.

    The session is part of the path so November and May/June papers of the
    same year can't overwrite each other.
    """
    parts = ["NSC", str(year), _slug(session.replace("/", "-")).replace("_", "-")]
    if grade != 12:
        parts.append(f"Grade_{grade}")
    parts.append(_slug(subject))
    suffix = "" if language == "English" else f"_{_slug(language)}"
    base = "/".join(parts)
    return (
        f"{base}/Paper_{paper_number}{suffix}.pdf",
        f"{base}/Paper_{paper_number}{suffix}_Memorandum.pdf",
    )


class SupabaseClient:
    def __init__(self, url: str, key: str, bucket: str, timeout: int = 120):
        if not url or not key:
            raise SupabaseError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        if key.startswith("sb_publishable_") or _looks_like_anon_jwt(key):
            raise SupabaseError(
                "SUPABASE_SERVICE_ROLE_KEY looks like a public (anon/publishable) key. "
                "The collector needs the service-role / secret key."
            )
        self.url = url.rstrip("/")
        self.bucket = bucket
        self.timeout = timeout
        self.session = requests.Session()
        headers = {"apikey": key}
        if key.startswith("eyJ"):
            headers["Authorization"] = f"Bearer {key}"
        self.session.headers.update(headers)

    # ------------------------------------------------------------------ #
    def _request(self, method: str, path: str, *, attempts: int = 3, **kwargs) -> requests.Response:
        url = f"{self.url}{path}"
        last_exc: Optional[Exception] = None
        for attempt in range(1, attempts + 1):
            try:
                resp = self.session.request(method, url, timeout=self.timeout, **kwargs)
            except requests.RequestException as exc:
                last_exc = exc
            else:
                if resp.status_code < 400:
                    return resp
                if resp.status_code not in (408, 429, 500, 502, 503, 504):
                    raise SupabaseError(f"{method} {path} -> {resp.status_code}: {_error_text(resp)}")
                last_exc = SupabaseError(f"{method} {path} -> {resp.status_code}: {_error_text(resp)}")
            if attempt < attempts:
                time.sleep(2 * attempt)
        raise SupabaseError(str(last_exc))

    # ------------------------------------------------------------------ #
    def select(self, table: str, columns: str, filters: Optional[dict] = None, page_size: int = 1000) -> list[dict]:
        rows: list[dict] = []
        offset = 0
        while True:
            params = {"select": columns, "limit": str(page_size), "offset": str(offset), "order": "id"}
            params.update(filters or {})
            resp = self._request("GET", f"/rest/v1/{table}", params=params)
            batch = resp.json()
            rows.extend(batch)
            if len(batch) < page_size:
                return rows
            offset += page_size

    def rpc(self, function: str, payload: dict) -> Any:
        resp = self._request(
            "POST",
            f"/rest/v1/rpc/{function}",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            attempts=2,
        )
        return resp.json() if resp.content else None

    def upload(self, path: str, data: bytes, content_type: str = "application/pdf") -> None:
        self._request(
            "POST",
            f"/storage/v1/object/{quote(self.bucket)}/{quote(path)}",
            data=data,
            headers={
                "Content-Type": content_type,
                "x-upsert": "true",
                "Cache-Control": "max-age=604800",
            },
        )

    def check_bucket(self) -> None:
        try:
            self._request("GET", f"/storage/v1/bucket/{quote(self.bucket)}", attempts=1)
        except SupabaseError as exc:
            raise SupabaseError(
                f"Storage bucket '{self.bucket}' is not reachable ({exc}). "
                "Run the SQL migration (it creates the bucket) or create it in the dashboard."
            ) from exc

    # ------------------------------------------------------------------ #
    def existing_papers(self) -> dict[tuple, dict]:
        """Every paper already stored, keyed exactly like PaperCandidate.key."""
        rows = self.select(
            "nsc_papers",
            "id,year,exam_session,grade,subject,paper_number,language,processing_status,extractor_version",
        )
        return {
            (r["year"], r["exam_session"], r["grade"], r["subject"], r["paper_number"], r["language"]): r
            for r in rows
        }


def _looks_like_anon_jwt(key: str) -> bool:
    if not key.startswith("eyJ"):
        return False
    try:
        import base64

        payload = key.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        return claims.get("role") == "anon"
    except Exception:  # not decodable: let the server decide
        return False


def _error_text(resp: requests.Response) -> str:
    try:
        body = resp.json()
        if isinstance(body, dict):
            return body.get("message") or body.get("error") or body.get("msg") or json.dumps(body)[:300]
    except ValueError:
        pass
    return (resp.text or "")[:300]
