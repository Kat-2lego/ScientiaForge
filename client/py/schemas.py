"""SkillForge Career Discovery - API contract (§50)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

class AnswerItem(BaseModel):
    question_id: str
    option_id: str


class QuestionnaireRequest(BaseModel):
    """Request for the generated question set."""

    core_domains: List[str] = Field(default_factory=list)
    deep_scan_enabled: bool = False

    @field_validator("core_domains")
    @classmethod
    def limit_domains(cls, value: List[str]) -> List[str]:
        return value[:3]


class QuestionnairePayload(BaseModel):
    """What the frontend posts when the questionnaire is finished."""

    core_domains: List[str] = Field(default_factory=list)
    academic_background: List[str] = Field(default_factory=list)
    school_subjects: List[str] = Field(default_factory=list)
    deep_scan_enabled: bool = False
    questionnaire_answers: List[AnswerItem] = Field(default_factory=list)
    # Accepted for backwards compatibility with the old frontend. The engine
    # derives personality from the deep-scan answers, so this is never the only
    # evidence used (§50).
    personality_traits: Optional[List[str]] = Field(default_factory=list)
    session_id: Optional[str] = None
    persist: bool = True


class CareerSearchRequest(BaseModel):
    """Free-text career lookup.

    The questionnaire fields are optional. When they are supplied the same
    matching engine scores the found occupations against the caller's profile,
    so a searched career shows a real match percentage rather than none.
    """

    query: str = Field(min_length=1, max_length=120)
    limit: int = Field(default=12, ge=1, le=30)
    core_domains: List[str] = Field(default_factory=list)
    academic_background: List[str] = Field(default_factory=list)
    school_subjects: List[str] = Field(default_factory=list)
    deep_scan_enabled: bool = False
    questionnaire_answers: List[AnswerItem] = Field(default_factory=list)


class SaveCareerRequest(BaseModel):
    onetsoc_code: str
    session_id: Optional[str] = None
    match_score: Optional[int] = None   # stored for reference; never trusted (§49)
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class QuestionOption(BaseModel):
    option_id: str
    text: str


class Question(BaseModel):
    question_id: str
    text: str
    section: str
    domain: Optional[str] = None
    deep_scan: bool = False
    options: List[QuestionOption]


class QuestionnaireResponse(BaseModel):
    questions: List[Question]
    total: int
    deep_scan_enabled: bool
    domains: List[str]


class CareerSuggestion(BaseModel):
    onetsoc_code: str
    title: str
    description: str
    match_score: int
    match_band: str
    confidence: str
    confidence_value: float
    group: str
    match_reason: str
    top_factors: List[str] = Field(default_factory=list)
    score_breakdown: Dict[str, int] = Field(default_factory=dict)
    tech_skills: List[str] = Field(default_factory=list)
    technology_demand: str
    job_zone: Optional[int] = None
    job_zone_label: str = ""
    salary: str
    salary_is_estimate: bool = True
    salary_note: str = ""
    image_url: str
    domain_fit: Dict[str, int] = Field(default_factory=dict)
    relevance: float = 0.0


class MatchResponse(BaseModel):
    session_id: Optional[str] = None
    profile: Dict[str, Any]
    matches: List[CareerSuggestion]
    related_careers: List[CareerSuggestion] = Field(default_factory=list)
    result_note: str = ""
    relevance_threshold_used: float = 0.0
    candidates_considered: int = 0
    session_saved: bool = False
    warnings: List[str] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: bool = True
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None
