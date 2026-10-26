"""
ScientiaForge Career Discovery - central configuration.

Every tunable number used by the matching engine lives here. Nothing in
matching_engine.py, career_repository.py or profile_builder.py should
contain a magic constant.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List

# ---------------------------------------------------------------------------
# .env loading
# ---------------------------------------------------------------------------
# Set-and-forget credentials: put them in py/.env instead of re-exporting them
# in every terminal (and `export` does not exist in PowerShell at all).
# Real environment variables always win over the file.


_loaded_from: List[str] = []
_seen_keys: set = set()
_duplicate_keys: set = set()


def _dotenv_candidates() -> List[Path]:
    """Where to look for .env, nearest first.

    An explicit SKILLFORGE_DOTENV wins. Otherwise we start beside this file
    and walk up the project tree, so the API still finds a .env kept at the
    repository root while uvicorn runs from client/py.
    """
    seen: List[Path] = []

    explicit = os.getenv("SKILLFORGE_DOTENV", "").strip().strip('"').strip("'")
    if explicit:
        seen.append(Path(explicit).expanduser())
        # Git Bash hands over MSYS paths like /c/Users/me/.env, which Windows
        # Python cannot resolve. Translate to C:/Users/me/.env and try that too.
        if len(explicit) > 2 and explicit[0] == "/" and explicit[2] == "/":
            seen.append(Path(f"{explicit[1].upper()}:/{explicit[3:]}"))
        # A bad explicit path is not a dead end: fall through to the search.

    here = Path(__file__).resolve().parent
    for folder in [here, *here.parents][:6] + [Path.cwd(), *Path.cwd().parents][:4]:
        candidate = folder / ".env"
        if candidate not in seen:
            seen.append(candidate)
    return seen


def _load_dotenv() -> None:
    for candidate in _dotenv_candidates():
        if not candidate.is_file():
            continue
        for line in candidate.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if key.lower().startswith("set "):        # tolerate `set KEY=value`
                key = key[4:].strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
            elif key in _seen_keys:
                _duplicate_keys.add(key)
            _seen_keys.add(key)
        _loaded_from.append(str(candidate))
        break


_load_dotenv()


# ---------------------------------------------------------------------------
# Database / runtime
# ---------------------------------------------------------------------------

# Preferred: direct Postgres connection string from Supabase
#   Project Settings -> Database -> Connection string -> URI
#   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
DATABASE_URL: str = os.getenv("SUPABASE_DB_URL", "") or os.getenv("DATABASE_URL", "")

# Fallback: PostgREST (supabase-py / httpx). Used when DATABASE_URL is empty.
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")

# Origins allowed to call the API during development / deployment.
CORS_ORIGINS: List[str] = [
    o.strip()
    for o in os.getenv(
        "SKILLFORGE_CORS_ORIGINS",
        "http://127.0.0.1:5501,http://localhost:5501,"
        "http://127.0.0.1:5500,http://localhost:5500,"
        "http://127.0.0.1:3000,http://localhost:3000",
    ).split(",")
    if o.strip()
]

# The O*NET cache is built once and reused. Rebuild after this many seconds.
CACHE_TTL_SECONDS: int = int(os.getenv("SKILLFORGE_CACHE_TTL", "21600"))  # 6h

# Where the built cache is persisted to disk between process restarts. A
# platform spin-down/spin-up (Render's free tier, for example) restarts the
# process but keeps its filesystem, so this turns what would otherwise be a
# multi-minute Supabase rebuild back into a sub-second load. Perfectly safe
# on a non-persistent disk too: if the file is ever missing, the cache is
# just rebuilt from Supabase exactly as it always was.
CACHE_FILE_PATH: str = os.getenv(
    "SKILLFORGE_CACHE_FILE",
    str(Path(__file__).resolve().parent / ".onet_cache.pkl"),
)

# Rows fetched per page when using the PostgREST fallback driver.
REST_PAGE_SIZE: int = 1000


# ---------------------------------------------------------------------------
# O*NET scales
# ---------------------------------------------------------------------------
# The analytical tables store several scales per element. We never assume a
# single scale: database.py/career_repository.py inspect the distinct scale_id
# values actually present and pick the first available entry of this list.
#
#   IM = Importance (1-5)   LV = Level (0-7)   OI = Occupational Interest (1-7)
#   IH = Interest High-Point (not a per-RIASEC value, deliberately excluded)
SCALE_PREFERENCE: Dict[str, List[str]] = {
    "abilities": ["IM", "LV"],
    "knowledge": ["IM", "LV"],
    "skillss": ["IM", "LV"],
    "work_activities": ["IM", "LV"],
    # This database's work_styles table uses WI and DR rather than O*NET's IM.
    # WI is preferred: DR is 0-10 but averages 0.86, so most values sit at zero
    # and percentile ranking cannot separate occupations. Swap the order here
    # if a future import restores IM.
    "work_styles": ["WI", "DR", "IM"],
    "interestss": ["OI"],
}

# Theoretical min/max per scale, used for the first (linear) normalisation
# pass before percentile ranking.
SCALE_BOUNDS: Dict[str, tuple] = {
    "IM": (1.0, 5.0),
    "LV": (0.0, 7.0),
    "OI": (1.0, 7.0),
    "WI": (-3.0, 5.0),      # observed -1.42 to 3.00 in this database
    "DR": (0.0, 10.0),
}

# Element-id prefixes that legitimately belong in each table. Anything else in
# the table is logged and ignored rather than silently scored.
ELEMENT_PREFIXES: Dict[str, tuple] = {
    "abilities": ("1.A.",),
    "work_styles": ("1.D.",),   # this database numbers work styles 1.D.*
    "interestss": ("1.B.1.",),   # the six RIASEC elements only
    "skillss": ("2.A.", "2.B."),
    "knowledge": ("2.C.",),
    "work_activities": ("4.A.",),
}

# Values used by O*NET for the suppression flags. Rows whose flag is in this
# set are excluded from scoring (§18).
SUPPRESS_TRUE_VALUES = {"Y", "y", "1", "T", "TRUE", "true", True, 1}


# ---------------------------------------------------------------------------
# Matching weights (§11) - must sum to 1.0
# ---------------------------------------------------------------------------

COMPONENT_WEIGHTS: Dict[str, float] = {
    "domain": 0.15,
    "interestss": 0.20,
    "abilities": 0.10,
    "knowledge": 0.15,
    "skillss": 0.12,
    "work_activities": 0.10,
    "work_styles": 0.08,
    "technology": 0.05,
    "academic_background": 0.03,
    "job_zone": 0.02,
}

# When Deep Personality Scan is enabled the behavioural answers add real
# evidence about interests and temperament, so those two dimensions are worth
# more. The delta is taken proportionally from the remaining components so the
# total still sums to 1.0 (see config.resolve_weights).
DEEP_SCAN_BOOST: Dict[str, float] = {
    "interestss": 0.04,
    "work_styles": 0.04,
}


def resolve_weights(deep_scan_enabled: bool) -> Dict[str, float]:
    """Return the component weights for this run, always summing to 1.0."""
    weights = dict(COMPONENT_WEIGHTS)
    if not deep_scan_enabled:
        return weights

    boost_total = sum(DEEP_SCAN_BOOST.values())
    donors = {k: v for k, v in weights.items() if k not in DEEP_SCAN_BOOST}
    donor_total = sum(donors.values())

    for key, extra in DEEP_SCAN_BOOST.items():
        weights[key] = weights[key] + extra
    for key, value in donors.items():
        weights[key] = value - boost_total * (value / donor_total)

    # Guard against drift from float arithmetic.
    total = sum(weights.values())
    return {k: v / total for k, v in weights.items()}


# ---------------------------------------------------------------------------
# Score calibration (§14)
# ---------------------------------------------------------------------------
# Component scores are percentile-based: 0.50 means "an average occupation for
# what this user asked for". The mapping below is absolute - it never rescales
# against the best result in the list - so a weak top match honestly reports a
# weak number.
#
#   raw 0.50 -> 50   (average)
#   raw 0.75 -> ~78  (good)
#   raw 0.90 -> ~92  (exceptional)
CALIBRATION_GAMMA: float = 0.92          # <1 lifts the middle of the curve
CALIBRATION_FLOOR: float = 0.0
CALIBRATION_CEILING: float = 100.0


def calibrate(raw: float) -> float:
    """Map a 0..1 weighted raw score onto the published 0-100 scale."""
    raw = max(0.0, min(1.0, raw))
    return max(
        CALIBRATION_FLOOR,
        min(CALIBRATION_CEILING, 100.0 * (raw ** CALIBRATION_GAMMA)),
    )


SCORE_BANDS = [
    (90, "Exceptional alignment"),
    (80, "Strong alignment"),
    (70, "Good alignment"),
    (60, "Moderate alignment"),
    (50, "Possible alignment"),
    (0, "Weak alignment"),
]


# ---------------------------------------------------------------------------
# Result selection
# ---------------------------------------------------------------------------

# Hard ceiling on how many questions a user is ever asked in one run. Domain
# questions are trimmed to fit; core and deep-scan questions are never cut.
MAX_QUESTIONS: int = 24
MIN_DOMAIN_QUESTIONS: int = 3

RESULT_COUNT: int = 10                # target number of returned careers (8-12)
RESULT_COUNT_MIN: int = 8
RESULT_COUNT_MAX: int = 12

# Answers may push weight onto domains the user did not select. That keeps
# cross-domain exploration alive (§15) without letting the questionnaire
# silently replace the user's own choice: unselected domains are damped, and a
# domain only widens the candidate pool once it clears POOL_DOMAIN_MIN_WEIGHT.
# Seed weight given to each domain the user explicitly selected, before any
# answers are counted.
SELECTED_DOMAIN_SEED: float = 2.0
UNSELECTED_DOMAIN_DAMPING: float = 0.35
POOL_DOMAIN_MIN_WEIGHT: float = 0.15

# Relevance ladder used by the no-match fallback (§43). The engine walks down
# this list until it has at least RESULT_COUNT_MIN candidates.
RELEVANCE_THRESHOLDS: List[float] = [0.55, 0.45, 0.35, 0.25, 0.0]

# Minimum domain fitness for an occupation to enter the candidate pool at the
# strictest level. Occupations below this AND outside every selected SOC family
# get the irrelevance penalty instead of a place in the pool.
DOMAIN_RELEVANCE_FLOOR: float = 0.45
IRRELEVANCE_PENALTY: float = 0.25     # subtracted from the raw score

# Maximal-marginal-relevance diversity (§23). 0 = pure score, 1 = pure variety.
DIVERSITY_LAMBDA: float = 0.22
# Never let diversity promote a career whose raw score is this far below the
# best remaining candidate.
DIVERSITY_MAX_SCORE_SACRIFICE: float = 0.06

# Related occupations (§24) must still clear this raw score to be shown.
RELATED_MIN_RAW_SCORE: float = 0.45
RELATED_MAX_RESULTS: int = 6

# Deterministic tie-break epsilon (§13). Ties are broken by onetsoc_code, never
# by randomness.
TIE_EPSILON: float = 0.001


# ---------------------------------------------------------------------------
# Confidence (§44)
# ---------------------------------------------------------------------------
# Confidence is about evidence, not about the size of the score.
CONFIDENCE_WEIGHTS = {
    "data_coverage": 0.45,     # how many O*NET dimensions this occupation has
    "profile_richness": 0.35,  # how much the user actually told us
    "score_margin": 0.20,      # separation from the median candidate
}
CONFIDENCE_BANDS = [(0.75, "High"), (0.5, "Moderate"), (0.0, "Low")]

# A questionnaire with this many answered questions counts as "complete"
# evidence for the profile-richness term.
PROFILE_RICHNESS_TARGET_ANSWERS: int = 18


# ---------------------------------------------------------------------------
# Job zone / salary (§27, §51)
# ---------------------------------------------------------------------------

# ZAR monthly bands. These are SkillForge planning estimates, NOT O*NET data,
# and every response marks them salary_is_estimate = True.
SALARY_ESTIMATES_ZAR: Dict[int, str] = {
    1: "R6,000 - R12,000",
    2: "R12,000 - R22,000",
    3: "R20,000 - R38,000",
    4: "R32,000 - R65,000",
    5: "R55,000 - R110,000",
}
SALARY_FALLBACK_ZAR = "R20,000 - R38,000"
SALARY_DISCLAIMER = (
    "SkillForge estimate for the South African market. Not O*NET wage data."
)

JOB_ZONE_LABELS: Dict[int, str] = {
    1: "Little or no preparation needed",
    2: "Some preparation needed",
    3: "Medium preparation needed",
    4: "Considerable preparation needed",
    5: "Extensive preparation needed",
}

# Target job zone implied by the user's stated background/education level.
BACKGROUND_TARGET_JOB_ZONE: Dict[str, int] = {
    "cs": 4,
    "math": 4,
    "art": 3,
    "business": 4,
    "engineering": 4,
    "health": 5,
}
DEFAULT_TARGET_JOB_ZONE: int = 4
# Reaching one zone higher than your current level is aspirational, not a
# mismatch, so over-shooting is penalised less than under-shooting.
JOB_ZONE_OVERSHOOT_PENALTY: float = 0.12
JOB_ZONE_UNDERSHOOT_PENALTY: float = 0.22


# ---------------------------------------------------------------------------
# Presentation (§52, §53)
# ---------------------------------------------------------------------------
# Images never influence matching. Resolution is by SOC group, with a neutral
# fallback so a missing image can never break a recommendation.
CAREER_IMAGE_FALLBACK = (
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40"
    "?auto=format&fit=crop&w=800&q=80"
)
CAREER_IMAGES_BY_SOC: Dict[str, str] = {
    "15-125": "https://images.unsplash.com/photo-1498050108023-c5249f4df085",  # software
    "15-124": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31",     # networks
    "15-20":  "https://images.unsplash.com/photo-1551288049-bebda4e38f71",     # data science
    "15-11":  "https://images.unsplash.com/photo-1531482615713-2afd69097998",  # research
    "15-":    "https://images.unsplash.com/photo-1461749280684-dccba630e2f6",  # computing
    "27-102": "https://images.unsplash.com/photo-1561070791-2526d30994b5",     # design
    "27-101": "https://images.unsplash.com/photo-1513364776144-60967b0f800f",  # art/media
    "27-30":  "https://images.unsplash.com/photo-1495020689067-958852a7765e",  # media/comms
    "27-":    "https://images.unsplash.com/photo-1522542550221-31fd19575a2d",  # creative
    "13-20":  "https://images.unsplash.com/photo-1554224155-6726b3ff858f",     # finance
    "13-":    "https://images.unsplash.com/photo-1552664730-d307ca884978",     # business
    "11-":    "https://images.unsplash.com/photo-1600880292203-757bb62b4baf",  # management
    "17-":    "https://images.unsplash.com/photo-1504307651254-35680f356dfd",  # engineering
    "19-":    "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69",  # science
    "25-":    "https://images.unsplash.com/photo-1524178232363-1fb2b075b655",  # education
    "29-":    "https://images.unsplash.com/photo-1580281657527-47b083b1f6f1",  # health
    "41-":    "https://images.unsplash.com/photo-1556740738-b6a63e27c4df",     # sales
}
IMAGE_QUERY_SUFFIX = "?auto=format&fit=crop&w=800&q=80"

# Technology demand labelling. O*NET gives us technology-level demand signals
# only, so we never claim occupation-level labour demand.
TECH_DEMAND_BANDS = [
    (5, "Strong technology demand signal"),
    (2, "Moderate technology demand signal"),
    (1, "Emerging technology demand signal"),
    (0, "No technology demand signal available"),
]
MAX_TECH_SKILLS_RETURNED: int = 6
