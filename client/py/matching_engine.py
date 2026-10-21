"""
SkillForge Career Discovery - the matching engine.

Every function is pure with respect to the O*NET cache and the user profile, so
each one can be unit-tested on a synthetic dataset without a database (§57, §58).

Scoring model
-------------
Each dimension produces a score in 0..1 where 0.5 means "an average occupation
for what this user asked for", because occupation values are percentile ranks
within their own element (see career_repository). Dimensions are combined with
the weights in config.COMPONENT_WEIGHTS, renormalised over the dimensions that
actually have data, and mapped to 0-100 by config.calibrate.

There is no randomness anywhere. Ties break on onetsoc_code (§13, §35).
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import config
import mappings
from career_repository import FEATURE_TABLES, ONetCache, Occupation
import profile_builder
from profile_builder import UserProfile

logger = logging.getLogger("skillforge.engine")

MIN_ELEMENT_COVERAGE = 0.30   # a dimension needs this much of the user's vector


@dataclass
class DimensionResult:
    score: float                        # 0..1
    coverage: float                     # 0..1 of the user's weight that was matched
    contributions: List[Tuple[str, float, float]] = field(default_factory=list)
    # (element_id, user_weight, occupation_percentile)


@dataclass
class ScoredCareer:
    occupation: Occupation
    raw_score: float
    components: Dict[str, DimensionResult]
    domain_fit: Dict[str, float]
    relevance: float
    penalty: float = 0.0
    group: str = "Exploration Career"

    @property
    def code(self) -> str:
        return self.occupation.code

    @property
    def match_score(self) -> int:
        return int(round(config.calibrate(self.raw_score)))


# ---------------------------------------------------------------------------
# Generic element scoring
# ---------------------------------------------------------------------------

def score_element_vector(
    user_vector: Dict[str, float], occupation_features: Dict[str, float]
) -> Optional[DimensionResult]:
    """Weighted mean of the occupation's percentiles over what the user wants."""
    if not user_vector:
        return None

    total_weight = 0.0
    matched_weight = 0.0
    accumulated = 0.0
    contributions: List[Tuple[str, float, float]] = []

    for element_id, weight in user_vector.items():
        if weight <= 0:
            continue
        total_weight += weight
        percentile = occupation_features.get(element_id)
        if percentile is None:
            continue
        matched_weight += weight
        accumulated += weight * percentile
        contributions.append((element_id, weight, percentile))

    if total_weight <= 0 or matched_weight <= 0:
        return None
    coverage = matched_weight / total_weight
    if coverage < MIN_ELEMENT_COVERAGE:
        return None

    contributions.sort(key=lambda item: (-(item[1] * item[2]), item[0]))
    return DimensionResult(
        score=accumulated / matched_weight, coverage=coverage, contributions=contributions
    )


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / (na * nb)


# ---------------------------------------------------------------------------
# Individual dimensions (§57)
# ---------------------------------------------------------------------------

def calculate_riasec_match(
    profile: UserProfile, occupation: Occupation
) -> Optional[DimensionResult]:
    """Shape comparison over the six RIASEC elements, not a keyword search (§10)."""
    occ_interests = occupation.features.get("interestss", {})
    if not occ_interests:
        return None

    user_values, occ_values, contributions = [], [], []
    matched_weight = total_weight = 0.0

    for name, element_id in mappings.RIASEC_ELEMENTS.items():
        user_weight = profile.riasec.get(name, 0.0)
        total_weight += user_weight
        percentile = occ_interests.get(element_id)
        if percentile is None:
            continue
        matched_weight += user_weight
        user_values.append(user_weight)
        occ_values.append(percentile)
        if user_weight > 0:
            contributions.append((element_id, user_weight, percentile))

    if total_weight <= 0 or not occ_values:
        return None

    # All-positive vectors sit in a narrow cosine band, so rescale to spread the
    # result across the usable range instead of reporting 0.9 for everyone.
    cosine = _cosine(user_values, occ_values)
    shape = max(0.0, min(1.0, (cosine - 0.55) / 0.45))

    # Blend shape with straight strength on the user's top interests so that an
    # occupation weak on the user's dominant interest cannot score highly on
    # shape alone.
    strength = score_element_vector(
        {mappings.RIASEC_ELEMENTS[n]: w for n, w in profile.riasec.items() if w > 0},
        occ_interests,
    )
    strength_score = strength.score if strength else 0.5

    contributions.sort(key=lambda item: (-(item[1] * item[2]), item[0]))
    return DimensionResult(
        score=0.55 * shape + 0.45 * strength_score,
        coverage=matched_weight / total_weight if total_weight else 0.0,
        contributions=contributions,
    )


def calculate_domain_fit(
    occupation: Occupation, domain: str, cache: ONetCache
) -> float:
    """How well an occupation embodies one SkillForge domain (§16)."""
    profile = mappings.DOMAIN_PROFILES.get(domain)
    if not profile:
        return 0.0

    total = matched = accumulated = 0.0
    for table, elements in profile.items():
        features = occupation.features.get(table, {})
        for element_id, weight in elements.items():
            total += weight
            percentile = features.get(element_id)
            if percentile is None:
                continue
            matched += weight
            accumulated += weight * percentile

    element_fit = (accumulated / matched) if matched > 0 else 0.0
    element_coverage = (matched / total) if total > 0 else 0.0
    if element_coverage < MIN_ELEMENT_COVERAGE:
        element_fit *= 0.8  # thin evidence: discount rather than invent

    prefixes = cache.valid_soc_prefixes.get(domain, [])
    soc_member = 1.0 if any(occupation.code.startswith(p) for p in prefixes) else 0.0
    if not soc_member and any(
        occupation.code.startswith(p) for p in mappings.CROSS_DOMAIN_BRIDGE_PREFIXES
    ):
        soc_member = 0.6  # bridge occupations (e.g. web/digital interface design)

    return max(0.0, min(1.0, 0.75 * element_fit + 0.25 * soc_member))


def calculate_domain_match(
    profile: UserProfile, occupation: Occupation, cache: ONetCache
) -> Tuple[DimensionResult, Dict[str, float], float]:
    """Weighted domain alignment plus the per-domain fits and peak relevance."""
    fits = {
        domain: calculate_domain_fit(occupation, domain, cache)
        for domain in (profile.domain_profile or {d: 0 for d in mappings.DOMAIN_KEYS})
    }
    score = sum(
        weight * fits.get(domain, 0.0)
        for domain, weight in profile.domain_profile.items()
    )
    # Relevance is judged against the domains that define the search space, so a
    # faint answer-driven domain cannot make an unrelated occupation look on-topic.
    pool = profile_builder.pool_domains(profile)
    relevance = max((fits.get(d, 0.0) for d in pool), default=0.0)
    contributions = [(d, profile.domain_profile.get(d, 0.0), f) for d, f in fits.items()]
    contributions.sort(key=lambda item: (-(item[1] * item[2]), item[0]))
    return (
        DimensionResult(score=max(0.0, min(1.0, score)), coverage=1.0,
                        contributions=contributions),
        fits,
        relevance,
    )


def calculate_technology_match(
    profile: UserProfile, occupation: Occupation
) -> Optional[DimensionResult]:
    """Does the occupation's real technology stack match the user's tooling? (§20)"""
    if not occupation.technologies or not occupation.tech_domain:
        return None
    score = sum(
        weight * occupation.tech_domain.get(domain, 0.0)
        for domain, weight in profile.technology_profile.items()
    )
    # A stack that O*NET flags as hot / in demand is a mild positive.
    demand_bonus = min(
        0.1, 0.02 * (occupation.hot_tech_count + occupation.in_demand_count)
    )
    contributions = [
        (d, w, occupation.tech_domain.get(d, 0.0))
        for d, w in profile.technology_profile.items()
    ]
    contributions.sort(key=lambda item: (-(item[1] * item[2]), item[0]))
    return DimensionResult(
        score=max(0.0, min(1.0, score + demand_bonus)), coverage=1.0,
        contributions=contributions,
    )


def calculate_academic_match(
    profile: UserProfile, occupation: Occupation
) -> Optional[DimensionResult]:
    """Background/subjects as a compatibility signal, never a filter (§8, §26)."""
    if not profile.background_vectors:
        return None

    total = matched = accumulated = 0.0
    contributions: List[Tuple[str, float, float]] = []
    for table, elements in profile.background_vectors.items():
        features = occupation.features.get(table, {})
        for element_id, weight in elements.items():
            total += weight
            percentile = features.get(element_id)
            if percentile is None:
                continue
            matched += weight
            accumulated += weight * percentile
            contributions.append((element_id, weight, percentile))

    if total <= 0 or matched <= 0:
        return None
    contributions.sort(key=lambda item: (-(item[1] * item[2]), item[0]))
    return DimensionResult(
        score=accumulated / matched, coverage=matched / total, contributions=contributions
    )


def calculate_job_zone_match(
    profile: UserProfile, occupation: Occupation
) -> Optional[DimensionResult]:
    """Supporting evidence only - never the primary score (§27)."""
    if not occupation.job_zone:
        return None
    delta = occupation.job_zone - profile.target_job_zone
    penalty = (
        config.JOB_ZONE_OVERSHOOT_PENALTY if delta > 0 else config.JOB_ZONE_UNDERSHOOT_PENALTY
    )
    score = max(0.0, 1.0 - abs(delta) * penalty)
    return DimensionResult(score=score, coverage=1.0, contributions=[])


def calculate_personality_alignment(
    profile: UserProfile, occupation: Occupation
) -> Optional[float]:
    """Reported separately in the breakdown when Deep Scan is on (§9, §22)."""
    if not profile.personality:
        return None
    total = matched = accumulated = 0.0
    for trait, weight in profile.personality.items():
        spec = mappings.PERSONALITY_DIMENSIONS.get(trait)
        if not spec or weight <= 0:
            continue
        total += weight
        percentile = occupation.features.get(spec["table"], {}).get(spec["element"])
        if percentile is None:
            continue
        matched += weight
        accumulated += weight * percentile
    if matched <= 0 or total <= 0:
        return None
    return accumulated / matched


# ---------------------------------------------------------------------------
# Final score
# ---------------------------------------------------------------------------

def calculate_final_score(
    profile: UserProfile, occupation: Occupation, cache: ONetCache
) -> ScoredCareer:
    weights = config.resolve_weights(profile.deep_scan_enabled)

    domain_result, domain_fits, relevance = calculate_domain_match(profile, occupation, cache)

    components: Dict[str, Optional[DimensionResult]] = {
        "domain": domain_result,
        "interestss": calculate_riasec_match(profile, occupation),
        "abilities": score_element_vector(
            profile.vector("abilities"), occupation.features.get("abilities", {})),
        "knowledge": score_element_vector(
            profile.vector("knowledge"), occupation.features.get("knowledge", {})),
        "skillss": score_element_vector(
            profile.vector("skillss"), occupation.features.get("skillss", {})),
        "work_activities": score_element_vector(
            profile.vector("work_activities"), occupation.features.get("work_activities", {})),
        "work_styles": score_element_vector(
            profile.vector("work_styles"), occupation.features.get("work_styles", {})),
        "technology": calculate_technology_match(profile, occupation),
        "academic_background": calculate_academic_match(profile, occupation),
        "job_zone": calculate_job_zone_match(profile, occupation),
    }

    available = {k: v for k, v in components.items() if v is not None}
    if not available:
        return ScoredCareer(occupation, 0.0, {}, domain_fits, relevance, penalty=0.0)

    weight_total = sum(weights[k] for k in available)
    raw = sum(weights[k] * result.score for k, result in available.items()) / weight_total

    # §15 - an occupation that cannot plausibly satisfy any selected domain gets
    # a major relevance penalty instead of quietly sitting near the top.
    penalty = 0.0
    if relevance < config.DOMAIN_RELEVANCE_FLOOR:
        shortfall = (config.DOMAIN_RELEVANCE_FLOOR - relevance) / config.DOMAIN_RELEVANCE_FLOOR
        penalty = config.IRRELEVANCE_PENALTY * shortfall
        raw = max(0.0, raw - penalty)

    return ScoredCareer(
        occupation=occupation,
        raw_score=raw,
        components=available,
        domain_fit=domain_fits,
        relevance=relevance,
        penalty=penalty,
    )


def score_all(
    profile: UserProfile, cache: ONetCache, codes: Optional[Sequence[str]] = None
) -> List[ScoredCareer]:
    pool = codes if codes is not None else cache.occupations.keys()
    scored = [
        calculate_final_score(profile, cache.occupations[code], cache)
        for code in pool
        if code in cache.occupations
    ]
    return rank_careers(scored)


def rank_careers(scored: List[ScoredCareer]) -> List[ScoredCareer]:
    """Deterministic ranking: score, then relevance, then code (§13)."""
    return sorted(
        scored,
        key=lambda s: (
            -round(s.raw_score / config.TIE_EPSILON),
            -round(s.relevance, 4),
            s.code,
        ),
    )


# ---------------------------------------------------------------------------
# Confidence (§44)
# ---------------------------------------------------------------------------

def calculate_confidence(
    scored: ScoredCareer, profile: UserProfile, median_raw: float
) -> Tuple[str, float]:
    coverage_terms = [r.coverage for r in scored.components.values()]
    dimension_coverage = len(scored.components) / len(config.COMPONENT_WEIGHTS)
    element_coverage = sum(coverage_terms) / len(coverage_terms) if coverage_terms else 0.0
    data_coverage = 0.5 * dimension_coverage + 0.5 * element_coverage

    margin = max(0.0, min(1.0, (scored.raw_score - median_raw) / 0.25))

    value = (
        config.CONFIDENCE_WEIGHTS["data_coverage"] * data_coverage
        + config.CONFIDENCE_WEIGHTS["profile_richness"] * profile.richness()
        + config.CONFIDENCE_WEIGHTS["score_margin"] * margin
    )
    for threshold, label in config.CONFIDENCE_BANDS:
        if value >= threshold:
            return label, round(value, 3)
    return "Low", round(value, 3)


# ---------------------------------------------------------------------------
# Explanations (§21, §45)
# ---------------------------------------------------------------------------

DIMENSION_PHRASES = {
    "interestss": "interest alignment",
    "knowledge": "knowledge alignment",
    "skillss": "skill alignment",
    "abilities": "ability alignment",
    "work_activities": "day-to-day activity match",
    "work_styles": "work-style match",
    "technology": "technology alignment",
    "domain": "domain relevance",
    "academic_background": "academic background fit",
    "job_zone": "education-level fit",
}


def _strength_word(score: float) -> str:
    if score >= 0.85:
        return "Exceptional"
    if score >= 0.72:
        return "Strong"
    if score >= 0.6:
        return "Good"
    if score >= 0.5:
        return "Moderate"
    return "Limited"


def _top_element_names(
    result: DimensionResult, cache: ONetCache, limit: int = 2, floor: float = 0.6
) -> List[str]:
    names = []
    for element_id, _weight, percentile in result.contributions:
        if percentile < floor:
            continue
        if element_id in mappings.ELEMENT_TO_RIASEC:
            names.append(mappings.ELEMENT_TO_RIASEC[element_id].title())
        elif element_id in mappings.DOMAIN_LABELS:
            names.append(mappings.DOMAIN_LABELS[element_id])
        else:
            names.append(cache.element_name(element_id))
        if len(names) >= limit:
            break
    return names


def top_factors(
    scored: ScoredCareer, cache: ONetCache, limit: int = 4
) -> List[Dict[str, Any]]:
    """The dimensions that actually pushed this career up, in order (§45)."""
    weights = config.COMPONENT_WEIGHTS
    ranked = sorted(
        scored.components.items(),
        key=lambda kv: (-(weights.get(kv[0], 0.0) * (kv[1].score - 0.5)), kv[0]),
    )
    factors: List[Dict[str, Any]] = []
    for name, result in ranked:
        contribution = weights.get(name, 0.0) * (result.score - 0.5)
        if contribution <= 0:
            continue
        elements = _top_element_names(result, cache)
        factors.append(
            {
                "dimension": name,
                "score": round(result.score * 100),
                "contribution": round(contribution, 4),
                "elements": elements,
                "text": _factor_sentence(name, result.score, elements),
            }
        )
        if len(factors) >= limit:
            break
    return factors


def _factor_sentence(dimension: str, score: float, elements: List[str]) -> str:
    strength = _strength_word(score)
    phrase = DIMENSION_PHRASES.get(dimension, dimension.replace("_", " "))
    if elements:
        joined = " and ".join(elements[:2])
        return f"{strength} {phrase} ({joined})"
    return f"{strength} {phrase}"


def generate_match_reason(scored: ScoredCareer, cache: ONetCache) -> str:
    """A sentence built from this career's real scoring components (§21)."""
    factors = top_factors(scored, cache, limit=3)
    if not factors:
        weakest = min(
            scored.components.items(), key=lambda kv: kv[1].score, default=None
        )
        if weakest and weakest[1].score < 0.45:
            return (
                "Included as a broader option: your profile only partly matches this "
                f"occupation's {DIMENSION_PHRASES.get(weakest[0], weakest[0])}."
            )
        return "A balanced but unremarkable fit against your profile."

    parts = [factor["text"] for factor in factors]
    if len(parts) == 1:
        return parts[0] + "."
    return ", ".join(parts[:-1]) + ", plus " + parts[-1].lower() + "."


# ---------------------------------------------------------------------------
# Diversity (§23)
# ---------------------------------------------------------------------------

def _signature(occupation: Occupation, profile: UserProfile) -> Dict[str, float]:
    signature: Dict[str, float] = {}
    for table in FEATURE_TABLES:
        user_vector = profile.vector(table)
        features = occupation.features.get(table, {})
        for element_id, weight in user_vector.items():
            if weight <= 0:
                continue
            percentile = features.get(element_id)
            if percentile is not None:
                signature[f"{table}:{element_id}"] = percentile * weight
    return signature


def _signature_similarity(a: Dict[str, float], b: Dict[str, float]) -> float:
    keys = set(a) & set(b)
    if not keys:
        return 0.0
    return _cosine([a[k] for k in keys], [b[k] for k in keys])


def occupation_similarity(
    first: ScoredCareer, second: ScoredCareer, profile: UserProfile
) -> float:
    family = 0.0
    if first.occupation.soc_broad == second.occupation.soc_broad:
        family = 1.0
    elif first.occupation.soc_minor == second.occupation.soc_minor:
        family = 0.7
    elif first.occupation.soc_major == second.occupation.soc_major:
        family = 0.3
    content = _signature_similarity(
        _signature(first.occupation, profile), _signature(second.occupation, profile)
    )
    return max(0.0, min(1.0, 0.6 * family + 0.4 * content))


def apply_result_diversity(
    ranked: List[ScoredCareer], profile: UserProfile, limit: int
) -> List[ScoredCareer]:
    """Maximal-marginal-relevance selection. Relevance always comes first."""
    if not ranked:
        return []

    selected: List[ScoredCareer] = [ranked[0]]
    remaining = list(ranked[1:])

    while remaining and len(selected) < limit:
        best_available = remaining[0].raw_score
        best_candidate = None
        best_value = -1.0

        for candidate in remaining:
            # Never sacrifice more relevance than the configured allowance.
            if best_available - candidate.raw_score > config.DIVERSITY_MAX_SCORE_SACRIFICE:
                break
            similarity = max(
                occupation_similarity(candidate, chosen, profile) for chosen in selected
            )
            value = candidate.raw_score - config.DIVERSITY_LAMBDA * similarity
            if value > best_value + 1e-9:
                best_value = value
                best_candidate = candidate

        chosen = best_candidate or remaining[0]
        selected.append(chosen)
        remaining.remove(chosen)

    return selected


# ---------------------------------------------------------------------------
# Candidate pool and fallback ladder (§43)
# ---------------------------------------------------------------------------

def load_candidate_occupations(
    profile: UserProfile, cache: ONetCache, threshold: float
) -> List[str]:
    """Occupations that plausibly satisfy the selected domains at `threshold`."""
    if threshold <= 0:
        return list(cache.occupations.keys())

    pool = profile_builder.pool_domains(profile)
    codes: List[str] = []
    for code, occupation in cache.occupations.items():
        best = 0.0
        for domain in pool:
            best = max(best, calculate_domain_fit(occupation, domain, cache))
            if best >= threshold:
                break
        if best >= threshold:
            codes.append(code)
    return codes


def build_ranked_results(
    profile: UserProfile, cache: ONetCache, limit: int = config.RESULT_COUNT
) -> Tuple[List[ScoredCareer], List[ScoredCareer], float, str]:
    """
    Returns (diverse_selection, full_ranking, threshold_used, confidence_note).

    Walks down RELEVANCE_THRESHOLDS until enough candidates clear the bar, so the
    user never sees "No specific matches found" while usable data exists.
    """
    ranked: List[ScoredCareer] = []
    used_threshold = config.RELEVANCE_THRESHOLDS[0]
    note = ""

    for index, threshold in enumerate(config.RELEVANCE_THRESHOLDS):
        codes = load_candidate_occupations(profile, cache, threshold)
        if len(codes) < config.RESULT_COUNT_MIN and threshold > 0:
            continue
        ranked = score_all(profile, cache, codes)
        used_threshold = threshold
        if len(ranked) >= config.RESULT_COUNT_MIN:
            if index > 0:
                note = (
                    "Few occupations matched your domains strongly, so the search was "
                    "widened. Treat these as directions to explore rather than exact fits."
                )
            break

    if not ranked:
        ranked = score_all(profile, cache)
        used_threshold = 0.0
        note = (
            "No occupation cleared the preferred relevance bar, so this is the best "
            "available evidence-based ranking across the whole database."
        )

    # Diversity decides WHICH careers are shown; the list is then re-sorted so
    # the user never sees a 76% card sitting above an 81% one.
    selection = rank_careers(apply_result_diversity(ranked, profile, limit))
    return selection, ranked, used_threshold, note


def load_related_careers(
    selection: Sequence[ScoredCareer],
    profile: UserProfile,
    cache: ONetCache,
    exclude: Sequence[str],
    limit: int = config.RELATED_MAX_RESULTS,
) -> List[ScoredCareer]:
    """
    Adjacent paths from related_occupations that still fit the user (§24).

    The top match is the primary source. If its related occupations are already
    on the results list, the next best matches are used to fill the strip rather
    than returning nothing - but every entry must still clear the threshold.
    """
    if not selection:
        return []

    excluded = set(exclude)
    results: List[ScoredCareer] = []
    seen: set = set()

    for source in list(selection)[:3]:
        for related_code, _tier, _index in cache.related.get(source.code, []):
            if related_code in excluded or related_code in seen:
                continue
            if related_code not in cache.occupations:
                continue
            scored = calculate_final_score(profile, cache.occupations[related_code], cache)
            if scored.raw_score < config.RELATED_MIN_RAW_SCORE:
                continue
            scored.group = "Adjacent Career"
            seen.add(related_code)
            results.append(scored)
            if len(results) >= limit:
                return rank_careers(results)

    return rank_careers(results)


def assign_groups(selection: List[ScoredCareer]) -> None:
    """Primary / Strong Alternative / Adjacent / Exploration (§25)."""
    if not selection:
        return
    top = selection[0].raw_score
    for index, scored in enumerate(selection):
        if index == 0:
            scored.group = "Primary Match"
        elif scored.raw_score >= top * 0.93:
            scored.group = "Strong Alternative"
        elif scored.raw_score >= top * 0.85:
            scored.group = "Adjacent Career"
        else:
            scored.group = "Exploration Career"


# ---------------------------------------------------------------------------
# Presentation helpers
# ---------------------------------------------------------------------------

def select_tech_skills(occupation: Occupation) -> List[str]:
    """Hot / in-demand technologies first, then the rest, de-duplicated (§20)."""
    ordered = sorted(
        occupation.technologies,
        key=lambda t: (not (t["hot"] or t["in_demand"]), t["example"].lower()),
    )
    seen, output = set(), []
    for tech in ordered:
        name = tech["example"].strip()
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        output.append(name)
        if len(output) >= config.MAX_TECH_SKILLS_RETURNED:
            break
    return output


def technology_demand_label(occupation: Occupation) -> str:
    signal = occupation.hot_tech_count + occupation.in_demand_count
    for threshold, label in config.TECH_DEMAND_BANDS:
        if signal >= threshold:
            return label
    return config.TECH_DEMAND_BANDS[-1][1]


def resolve_image(occupation: Occupation) -> str:
    """Presentation only. Never affects matching (§52)."""
    for prefix in sorted(config.CAREER_IMAGES_BY_SOC, key=len, reverse=True):
        if occupation.code.startswith(prefix):
            return config.CAREER_IMAGES_BY_SOC[prefix] + config.IMAGE_QUERY_SUFFIX
    return config.CAREER_IMAGE_FALLBACK


def salary_estimate(occupation: Occupation) -> str:
    if occupation.job_zone in config.SALARY_ESTIMATES_ZAR:
        return config.SALARY_ESTIMATES_ZAR[occupation.job_zone]
    return config.SALARY_FALLBACK_ZAR


def score_band(match_score: int) -> str:
    for threshold, label in config.SCORE_BANDS:
        if match_score >= threshold:
            return label
    return config.SCORE_BANDS[-1][1]


def serialise_career(
    scored: ScoredCareer,
    profile: UserProfile,
    cache: ONetCache,
    median_raw: float,
) -> Dict[str, Any]:
    """The per-career response object described in §22 and §50."""
    occupation = scored.occupation
    confidence_label, confidence_value = calculate_confidence(scored, profile, median_raw)
    factors = top_factors(scored, cache)
    personality = calculate_personality_alignment(profile, occupation)

    breakdown = {
        name: round(result.score * 100)
        for name, result in scored.components.items()
    }
    if personality is not None:
        breakdown["personality"] = round(personality * 100)

    return {
        "onetsoc_code": occupation.code,
        "title": occupation.title,
        "description": occupation.description,
        "match_score": scored.match_score,
        "match_band": score_band(scored.match_score),
        "confidence": confidence_label,
        "confidence_value": confidence_value,
        "group": scored.group,
        "match_reason": generate_match_reason(scored, cache),
        "top_factors": [factor["text"] for factor in factors],
        "score_breakdown": breakdown,
        "tech_skills": select_tech_skills(occupation),
        "technology_demand": technology_demand_label(occupation),
        "job_zone": occupation.job_zone,
        "job_zone_label": config.JOB_ZONE_LABELS.get(occupation.job_zone or 0, "Unknown"),
        "salary": salary_estimate(occupation),
        "salary_is_estimate": True,
        "salary_note": config.SALARY_DISCLAIMER,
        "image_url": resolve_image(occupation),
        "domain_fit": {d: round(v * 100) for d, v in scored.domain_fit.items()},
        "relevance": round(scored.relevance, 3),
    }
