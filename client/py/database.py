"""
SkillForge Career Discovery - Supabase PostgreSQL access.

Two interchangeable drivers:

  * PostgresDriver  - psycopg 3 against the Supabase connection string.
                      Preferred: supports aggregates, DISTINCT and real SQL.
  * PostgrestDriver - httpx against the Supabase REST endpoint, used when only
                      SUPABASE_URL + a key are available. Paginates in
                      REST_PAGE_SIZE blocks.

Both expose the same three methods, so career_repository.py never knows which
one it is talking to. There is no pyodbc and no SQL Server syntax anywhere.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional, Sequence

import config

logger = logging.getLogger("skillforge.database")


class DatabaseError(RuntimeError):
    """Raised for any failure to reach or read the career database."""


class BaseDriver:
    name = "base"

    def fetch_table(
        self,
        table: str,
        columns: Sequence[str],
        where_sql: str = "",
        params: Optional[Sequence[Any]] = None,
    ) -> List[Dict[str, Any]]:
        raise NotImplementedError

    def count_table(self, table: str) -> int:
        raise NotImplementedError

    def distinct_values(self, table: str, column: str) -> List[Any]:
        raise NotImplementedError

    def healthcheck(self) -> bool:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# psycopg driver
# ---------------------------------------------------------------------------

class PostgresDriver(BaseDriver):
    name = "postgres"

    def __init__(self, dsn: str) -> None:
        try:
            import psycopg  # noqa: F401
            from psycopg_pool import ConnectionPool
        except ImportError as exc:  # pragma: no cover - env issue
            raise DatabaseError(
                "psycopg[binary,pool] is required for the Postgres driver"
            ) from exc

        self._dsn = dsn
        try:
            self._pool = ConnectionPool(
                dsn, min_size=1, max_size=6, kwargs={"autocommit": True},
                open=True, timeout=15,
            )
        except Exception as exc:
            raise DatabaseError(f"Could not open a Supabase pool: {exc}") from exc

    def _rows(self, sql: str, params: Optional[Sequence[Any]] = None) -> List[Dict[str, Any]]:
        from psycopg.rows import dict_row

        try:
            with self._pool.connection() as conn:
                with conn.cursor(row_factory=dict_row) as cur:
                    cur.execute(sql, params or ())
                    return list(cur.fetchall())
        except Exception as exc:
            logger.exception("Query failed: %s", sql[:200])
            raise DatabaseError(str(exc)) from exc

    def fetch_table(self, table, columns, where_sql="", params=None):
        cols = ", ".join(f'"{c}"' for c in columns)
        clause = f" WHERE {where_sql}" if where_sql else ""
        return self._rows(f'SELECT {cols} FROM "{table}"{clause}', params)

    def count_table(self, table: str) -> int:
        rows = self._rows(f'SELECT COUNT(*) AS n FROM "{table}"')
        return int(rows[0]["n"]) if rows else 0

    def distinct_values(self, table: str, column: str) -> List[Any]:
        rows = self._rows(f'SELECT DISTINCT "{column}" AS v FROM "{table}"')
        return [r["v"] for r in rows]

    def healthcheck(self) -> bool:
        return bool(self._rows("SELECT 1 AS ok"))


# ---------------------------------------------------------------------------
# PostgREST driver
# ---------------------------------------------------------------------------

class PostgrestDriver(BaseDriver):
    """Read-only fallback. Only supports the simple selects the engine needs."""

    name = "postgrest"

    def __init__(self, url: str, key: str) -> None:
        import httpx

        if not url or not key:
            raise DatabaseError("SUPABASE_URL and a Supabase key are required")
        self._base = url.rstrip("/") + "/rest/v1"
        self._client = httpx.Client(
            timeout=60,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Accept": "application/json",
            },
        )

    def fetch_table(self, table, columns, where_sql="", params=None):
        # where_sql is ignored on purpose: the repository only ever filters on
        # things this driver can express, and it passes them via `params` as a
        # dict of PostgREST filters.
        query: Dict[str, str] = {"select": ",".join(columns)}
        if isinstance(params, dict):
            query.update(params)

        out: List[Dict[str, Any]] = []
        offset = 0
        while True:
            headers = {
                "Range-Unit": "items",
                "Range": f"{offset}-{offset + config.REST_PAGE_SIZE - 1}",
            }
            try:
                resp = self._client.get(
                    f"{self._base}/{table}", params=query, headers=headers
                )
                resp.raise_for_status()
            except Exception as exc:
                logger.exception("PostgREST read failed for %s", table)
                raise DatabaseError(str(exc)) from exc

            page = resp.json()
            out.extend(page)
            if len(page) < config.REST_PAGE_SIZE:
                return out
            offset += config.REST_PAGE_SIZE

    def count_table(self, table: str) -> int:
        try:
            resp = self._client.get(
                f"{self._base}/{table}",
                params={"select": "*"},
                headers={"Prefer": "count=exact", "Range": "0-0"},
            )
            resp.raise_for_status()
        except Exception as exc:
            raise DatabaseError(str(exc)) from exc
        content_range = resp.headers.get("content-range", "*/0")
        return int(content_range.split("/")[-1] or 0)

    def distinct_values(self, table: str, column: str) -> List[Any]:
        rows = self.fetch_table(table, [column])
        return sorted({r[column] for r in rows if r.get(column) is not None})

    def healthcheck(self) -> bool:
        self.count_table("occupation_data")
        return True


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_driver: Optional[BaseDriver] = None


def get_driver() -> BaseDriver:
    """Return the process-wide driver, creating it on first use."""
    global _driver
    if _driver is not None:
        return _driver

    rest_key = config.SUPABASE_SERVICE_KEY or config.SUPABASE_ANON_KEY
    if config.DATABASE_URL:
        try:
            _driver = PostgresDriver(config.DATABASE_URL)
            logger.info("Using direct Postgres connection to Supabase")
            return _driver
        except DatabaseError as exc:
            # psycopg missing is a setup problem, not a dead end: if REST
            # credentials exist, keep the app usable and say why.
            if not (config.SUPABASE_URL and rest_key):
                raise
            logger.warning(
                "Postgres driver unavailable (%s). Falling back to PostgREST; "
                "run 'pip install \"psycopg[binary,pool]\"' for the faster path.",
                exc,
            )

    if config.SUPABASE_URL and (config.SUPABASE_SERVICE_KEY or config.SUPABASE_ANON_KEY):
        logger.info("Using Supabase PostgREST fallback driver")
        _driver = PostgrestDriver(
            config.SUPABASE_URL,
            config.SUPABASE_SERVICE_KEY or config.SUPABASE_ANON_KEY,
        )
    else:
        raise DatabaseError(
            "No database configuration found. Set SUPABASE_DB_URL "
            "(preferred) or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."
        )
    return _driver


def set_driver(driver: Optional[BaseDriver]) -> None:
    """Injection point for tests."""
    global _driver
    _driver = driver


def chunked(items: Iterable[Any], size: int) -> Iterable[List[Any]]:
    batch: List[Any] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch
