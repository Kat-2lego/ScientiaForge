"""
SkillForge Career Discovery - O*NET repository.

The whole O*NET feature space is small enough (~250k rows) to load once into
process memory in a handful of bulk queries and then score entirely in RAM.
That removes the N+1 query architecture of the previous implementation (§36)
without giving up any accuracy.

What the cache holds per occupation:
    * title / description / job zone
    * per-table {element_id: percentile}, where the percentile is the
      occupation's rank for that element across all occupations that have it
    * technology rows plus a per-domain technology profile
    * related occupations

Percentile ranking is what makes different tables comparable (§11): an
Importance of 4.2 means nothing on its own, but "88th percentile for
Thinking Creatively" is directly comparable to "40th percentile for
Mathematics".
"""

from __future__ import annotations

import bisect
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import config
import mappings
from database import BaseDriver, DatabaseError, get_driver

logger = logging.getLogger("skillforge.repository")

FEATURE_TABLES: Tuple[str, ...] = (
    "abilities",
    "interests",
    "knowledge",
    "skills",
    "work_activities",
    "work_styles",
)

# Columns actually present per table (§3). interests and work_styles carry no
# suppression flags, so we never ask for them.
TABLE_COLUMNS: Dict[str, List[str]] = {
    "abilities": ["onetsoc_code", "element_id", "scale_id", "data_value",
                  "recommend_suppress", "not_relevant"],
    "knowledge": ["onetsoc_code", "element_id", "scale_id", "data_value",
                  "recommend_suppress", "not_relevant"],
    "skills": ["onetsoc_code", "element_id", "scale_id", "data_value",
               "recommend_suppress", "not_relevant"],
    "work_activities": ["onetsoc_code", "element_id", "scale_id", "data_value",
                        "recommend_suppress", "not_relevant"],
    "interests": ["onetsoc_code", "element_id", "scale_id", "data_value"],
    "work_styles": ["onetsoc_code", "element_id", "scale_id", "data_value"],
}


@dataclass
class Occupation:
    """One O*NET occupation with everything the engine needs, pre-normalised."""

    code: str
    title: str
    description: str
    job_zone: Optional[int] = None
    # table -> element_id -> percentile (0..1)
    features: Dict[str, Dict[str, float]] = field(default_factory=dict)
    # table -> element_id -> raw data_value (kept for auditing / debugging)
    raw: Dict[str, Dict[str, float]] = field(default_factory=dict)
    technologies: List[Dict[str, Any]] = field(default_factory=list)
    tech_domain: Dict[str, float] = field(default_factory=dict)
    hot_tech_count: int = 0
    in_demand_count: int = 0

    @property
    def soc_major(self) -> str:
        return self.code[:3]

    @property
    def soc_minor(self) -> str:
        return self.code[:5]

    @property
    def soc_broad(self) -> str:
        return self.code[:7]

    def value(self, table: str, element_id: str) -> Optional[float]:
        return self.features.get(table, {}).get(element_id)

    def data_coverage(self) -> float:
        """Fraction of the six analytical tables that hold data for this job."""
        present = sum(1 for t in FEATURE_TABLES if self.features.get(t))
        return present / len(FEATURE_TABLES)


@dataclass
class ONetCache:
    occupations: Dict[str, Occupation]
    element_names: Dict[str, str]
    element_descriptions: Dict[str, str]
    related: Dict[str, List[Tuple[str, Optional[str], Optional[int]]]]
    scales_used: Dict[str, str]
    valid_soc_prefixes: Dict[str, List[str]]
    warnings: List[str]
    built_at: float
    row_counts: Dict[str, int]

    def element_name(self, element_id: str) -> str:
        return self.element_names.get(element_id, element_id)


_cache: Optional[ONetCache] = None
_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_suppressed(row: Dict[str, Any]) -> bool:
    """§18 - respect recommend_suppress / not_relevant whatever their encoding."""
    for flag in ("recommend_suppress", "not_relevant"):
        value = row.get(flag)
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
        if value in config.SUPPRESS_TRUE_VALUES:
            return True
    return False


def _pick_scale(table: str, rows: Sequence[Dict[str, Any]]) -> Optional[str]:
    """Choose the scale actually present in this database (§19)."""
    seen: Dict[str, int] = {}
    for row in rows:
        scale = (row.get("scale_id") or "").strip()
        if scale:
            seen[scale] = seen.get(scale, 0) + 1
    if not seen:
        return None
    for preferred in config.SCALE_PREFERENCE.get(table, []):
        if preferred in seen:
            return preferred
    # Nothing from the preference list: fall back to the most common scale and
    # say so loudly rather than mixing scales silently.
    fallback = max(seen, key=lambda k: seen[k])
    logger.warning(
        "Table %s has no preferred scale %s; falling back to %s",
        table, config.SCALE_PREFERENCE.get(table), fallback,
    )
    return fallback


def _linear_normalise(scale_id: str, value: float) -> float:
    low, high = config.SCALE_BOUNDS.get(scale_id, (0.0, 100.0))
    if high <= low:
        return 0.0
    return max(0.0, min(1.0, (value - low) / (high - low)))


def _percentile_index(sorted_values: List[float], value: float) -> float:
    """Mid-rank percentile of `value` within `sorted_values` (0..1)."""
    n = len(sorted_values)
    if n <= 1:
        return 0.5
    left = bisect.bisect_left(sorted_values, value)
    right = bisect.bisect_right(sorted_values, value)
    return ((left + right) / 2.0) / n


# ---------------------------------------------------------------------------
# Cache construction
# ---------------------------------------------------------------------------

def build_cache(driver: Optional[BaseDriver] = None) -> ONetCache:
    """Load and normalise the entire O*NET feature space. Called once."""
    driver = driver or get_driver()
    started = time.time()
    warnings: List[str] = []
    row_counts: Dict[str, int] = {}

    # --- occupations -------------------------------------------------------
    occ_rows = driver.fetch_table(
        "occupation_data", ["onetsoc_code", "title", "description"]
    )
    row_counts["occupation_data"] = len(occ_rows)
    occupations: Dict[str, Occupation] = {}
    for row in occ_rows:
        code = (row.get("onetsoc_code") or "").strip()
        title = (row.get("title") or "").strip()
        if not code or not title:      # hard filter (§15)
            continue
        occupations[code] = Occupation(
            code=code, title=title, description=(row.get("description") or "").strip()
        )
    if not occupations:
        raise DatabaseError("occupation_data returned no usable rows")

    # --- content model reference ------------------------------------------
    cmr_rows = driver.fetch_table(
        "content_model_reference", ["element_id", "element_name", "description"]
    )
    row_counts["content_model_reference"] = len(cmr_rows)
    element_names = {
        (r.get("element_id") or "").strip(): (r.get("element_name") or "").strip()
        for r in cmr_rows
    }
    element_descriptions = {
        (r.get("element_id") or "").strip(): (r.get("description") or "").strip()
        for r in cmr_rows
    }

    # Validate every mapped element ID against the database (§16, §39).
    for element_id in mappings.all_mapped_element_ids():
        if element_id not in element_names:
            warnings.append(
                f"Mapped element_id {element_id} is not in content_model_reference; "
                "the mapping will be ignored."
            )
    if warnings:
        for message in warnings:
            logger.warning(message)

    # --- job zones ---------------------------------------------------------
    jz_rows = driver.fetch_table("job_zones", ["onetsoc_code", "job_zone"])
    row_counts["job_zones"] = len(jz_rows)
    for row in jz_rows:
        occ = occupations.get((row.get("onetsoc_code") or "").strip())
        if occ is None:
            continue
        try:
            occ.job_zone = int(row["job_zone"])
        except (TypeError, ValueError):
            continue

    # --- analytical tables -------------------------------------------------
    scales_used: Dict[str, str] = {}
    for table in FEATURE_TABLES:
        rows = driver.fetch_table(table, TABLE_COLUMNS[table])
        row_counts[table] = len(rows)
        scale = _pick_scale(table, rows)
        if scale is None:
            warnings.append(f"Table {table} has no scale_id values; skipped.")
            continue
        scales_used[table] = scale
        _ingest_feature_table(table, scale, rows, occupations, element_names, warnings)

    # --- percentile normalisation -----------------------------------------
    _normalise_features(occupations)

    # --- technology --------------------------------------------------------
    tech_rows = driver.fetch_table(
        "technology_skills",
        ["onetsoc_code", "example", "commodity_code", "hot_technology", "in_demand"],
    )
    row_counts["technology_skills"] = len(tech_rows)
    _ingest_technology(tech_rows, occupations)

    # --- related occupations ----------------------------------------------
    rel_rows = driver.fetch_table(
        "related_occupations",
        ["onetsoc_code", "related_onetsoc_code", "relatedness_tier", "related_index"],
    )
    row_counts["related_occupations"] = len(rel_rows)
    related: Dict[str, List[Tuple[str, Optional[str], Optional[int]]]] = {}
    for row in rel_rows:
        src = (row.get("onetsoc_code") or "").strip()
        dst = (row.get("related_onetsoc_code") or "").strip()
        if src not in occupations or dst not in occupations:
            continue
        try:
            index = int(row.get("related_index")) if row.get("related_index") is not None else None
        except (TypeError, ValueError):
            index = None
        related.setdefault(src, []).append((dst, row.get("relatedness_tier"), index))
    for src in related:
        related[src].sort(key=lambda t: (t[2] if t[2] is not None else 9999, t[0]))

    # --- SOC prefix validation (§16) --------------------------------------
    valid_soc_prefixes: Dict[str, List[str]] = {}
    all_codes = list(occupations.keys())
    for domain, prefixes in mappings.DOMAIN_SOC_PREFIXES.items():
        usable = []
        for prefix in prefixes:
            if any(code.startswith(prefix) for code in all_codes):
                usable.append(prefix)
            else:
                warnings.append(
                    f"SOC prefix '{prefix}' for domain '{domain}' matches no "
                    "occupation_data row; dropped."
                )
        valid_soc_prefixes[domain] = usable

    cache = ONetCache(
        occupations=occupations,
        element_names=element_names,
        element_descriptions=element_descriptions,
        related=related,
        scales_used=scales_used,
        valid_soc_prefixes=valid_soc_prefixes,
        warnings=warnings,
        built_at=time.time(),
        row_counts=row_counts,
    )
    logger.info(
        "O*NET cache built in %.1fs: %d occupations, scales=%s",
        time.time() - started, len(occupations), scales_used,
    )
    return cache


def _ingest_feature_table(
    table: str,
    scale: str,
    rows: Sequence[Dict[str, Any]],
    occupations: Dict[str, Occupation],
    element_names: Dict[str, str],
    warnings: List[str],
) -> None:
    prefixes = config.ELEMENT_PREFIXES.get(table, ())
    unknown_elements = set()
    kept = 0

    for row in rows:
        if (row.get("scale_id") or "").strip() != scale:
            continue
        if _is_suppressed(row):
            continue

        code = (row.get("onetsoc_code") or "").strip()
        occ = occupations.get(code)
        if occ is None:                       # hard filter: unknown occupation
            continue

        element_id = (row.get("element_id") or "").strip()
        if not element_id:
            continue
        if prefixes and not element_id.startswith(prefixes):
            unknown_elements.add(element_id)
            continue
        if element_id not in element_names:
            unknown_elements.add(element_id)
            continue

        try:
            value = float(row["data_value"])
        except (TypeError, ValueError, KeyError):
            continue

        occ.raw.setdefault(table, {})[element_id] = value
        occ.features.setdefault(table, {})[element_id] = _linear_normalise(scale, value)
        kept += 1

    if unknown_elements:
        warnings.append(
            f"{table}: ignored {len(unknown_elements)} element_id values outside "
            f"{prefixes} or missing from content_model_reference."
        )
    logger.info("%s: kept %d rows on scale %s", table, kept, scale)


def _normalise_features(occupations: Dict[str, Occupation]) -> None:
    """Replace linear 0..1 values with cross-occupation percentile ranks."""
    for table in FEATURE_TABLES:
        by_element: Dict[str, List[float]] = {}
        for occ in occupations.values():
            for element_id, value in occ.features.get(table, {}).items():
                by_element.setdefault(element_id, []).append(value)
        for values in by_element.values():
            values.sort()

        for occ in occupations.values():
            table_features = occ.features.get(table)
            if not table_features:
                continue
            for element_id, value in list(table_features.items()):
                table_features[element_id] = _percentile_index(
                    by_element[element_id], value
                )


def _ingest_technology(
    rows: Sequence[Dict[str, Any]], occupations: Dict[str, Occupation]
) -> None:
    truthy = config.SUPPRESS_TRUE_VALUES  # same Y/1/true encodings

    for row in rows:
        occ = occupations.get((row.get("onetsoc_code") or "").strip())
        if occ is None:
            continue
        example = (row.get("example") or "").strip()
        if not example:
            continue
        hot = row.get("hot_technology")
        demand = row.get("in_demand")
        hot = (hot.strip() if isinstance(hot, str) else hot) in truthy
        demand = (demand.strip() if isinstance(demand, str) else demand) in truthy
        occ.technologies.append(
            {
                "example": example,
                "commodity_code": row.get("commodity_code"),
                "hot": hot,
                "in_demand": demand,
            }
        )
        occ.hot_tech_count += 1 if hot else 0
        occ.in_demand_count += 1 if demand else 0

    for occ in occupations.values():
        if not occ.technologies:
            continue
        totals: Dict[str, float] = {d: 0.0 for d in mappings.DOMAIN_KEYS}
        for tech in occ.technologies:
            haystack = tech["example"].lower()
            boost = 1.0 + (0.5 if tech["hot"] or tech["in_demand"] else 0.0)
            for domain, keywords in mappings.TECH_KEYWORDS_BY_DOMAIN.items():
                if any(keyword in haystack for keyword in keywords):
                    totals[domain] += boost
        denominator = float(len(occ.technologies))
        occ.tech_domain = {
            # saturating: 25% of an occupation's stack in one family is already
            # a strong signal, so we cap rather than let huge stacks dominate.
            domain: min(1.0, (score / denominator) / 0.25)
            for domain, score in totals.items()
        }


# ---------------------------------------------------------------------------
# Public accessors
# ---------------------------------------------------------------------------

def get_cache(force_rebuild: bool = False) -> ONetCache:
    global _cache
    with _lock:
        expired = (
            _cache is not None
            and time.time() - _cache.built_at > config.CACHE_TTL_SECONDS
        )
        if _cache is None or expired or force_rebuild:
            _cache = build_cache()
        return _cache


def set_cache(cache: Optional[ONetCache]) -> None:
    """Injection point for tests."""
    global _cache
    _cache = cache


def validate_database(driver: Optional[BaseDriver] = None) -> Dict[str, Any]:
    """§38/§59 - report row counts, scales and mapping health without crashing."""
    driver = driver or get_driver()
    expected = {
        "occupation_data": 1016,
        "content_model_reference": 630,
        "abilities": 46488,
        "interests": 5538,
        "job_zones": 923,
        "knowledge": 29502,
        "related_occupations": 18460,
        "skills": 31290,
        "technology_skills": 32773,
        "work_activities": 36654,
        "work_styles": 37422,
    }
    tables: Dict[str, Any] = {}
    for table, approx in expected.items():
        try:
            actual = driver.count_table(table)
            tables[table] = {
                "rows": actual,
                "expected_approx": approx,
                "within_10_percent": abs(actual - approx) <= max(50, approx * 0.10),
            }
        except DatabaseError as exc:
            tables[table] = {"error": str(exc)}

    cache = get_cache()
    return {
        "tables": tables,
        "scales_used": cache.scales_used,
        "valid_soc_prefixes": cache.valid_soc_prefixes,
        "occupations_loaded": len(cache.occupations),
        "occupations_with_job_zone": sum(
            1 for o in cache.occupations.values() if o.job_zone
        ),
        "occupations_with_technology": sum(
            1 for o in cache.occupations.values() if o.technologies
        ),
        "warnings": cache.warnings,
    }


def search_occupations(cache: "ONetCache", query: str, limit: int) -> List[str]:
    """Rank occupations by how well their title or description matches `query`.

    Runs entirely over the in-memory cache, so it costs no database round trip.
    Scoring is deliberately simple and explainable: an exact title match beats a
    title prefix, which beats a title substring, which beats every term
    appearing somewhere in the title, which beats a description hit.
    """
    needle = " ".join(query.lower().split())
    if not needle:
        return []
    terms = [t for t in needle.split() if len(t) > 1]

    scored: List[tuple] = []
    for code, occ in cache.occupations.items():
        title = occ.title.lower()
        description = (occ.description or "").lower()

        if title == needle:
            rank = 100
        elif title.startswith(needle):
            rank = 90
        elif needle in title:
            rank = 80
        elif terms and all(t in title for t in terms):
            rank = 70
        elif terms and any(t in title for t in terms):
            rank = 50 + int(20 * sum(t in title for t in terms) / len(terms))
        elif terms and all(t in description for t in terms):
            rank = 40
        elif terms and any(t in description for t in terms):
            rank = 20
        else:
            continue

        # Shorter titles win ties: "Web Developers" before
        # "Web and Digital Interface Designers" for the query "web".
        scored.append((-rank, len(occ.title), occ.title, code))

    scored.sort()
    return [code for _, _, _, code in scored[:limit]]
