"""
SkillForge Career Discovery - request validation and error taxonomy (§40).

A backend failure must never reach the browser disguised as "No matches found",
and a database error must never reach the browser carrying connection details.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import mappings
import question_bank


class AppError(Exception):
    """Base for every error that becomes a structured JSON response."""

    code = "SERVER_ERROR"
    status = 500
    message = "Something went wrong while generating your career matches."

    def __init__(self, message: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        super().__init__(message or self.message)
        self.public_message = message or self.message
        self.details = details or {}


class ValidationError(AppError):
    code = "VALIDATION_ERROR"
    status = 400
    message = "The questionnaire submission was incomplete or invalid."


class InvalidQuestionnaireError(AppError):
    code = "INVALID_QUESTIONNAIRE"
    status = 400
    message = "None of the submitted answers could be matched to the question bank."


class DatabaseUnavailableError(AppError):
    code = "DATABASE_ERROR"
    status = 503
    message = "Career data could not be loaded. Please try again shortly."


class NoCandidatesError(AppError):
    code = "NO_CANDIDATES"
    status = 200   # a legitimate empty result, not a failure
    message = "The career database contains no usable occupations for this profile."


class AuthRequiredError(AppError):
    code = "AUTH_REQUIRED"
    status = 401
    message = "Sign in to save a career path."


def validate_domains(domains: List[str]) -> Tuple[List[str], List[str]]:
    """Keep up to three known domains; report the rest as warnings (§5)."""
    warnings: List[str] = []
    cleaned: List[str] = []
    for domain in domains:
        slug = (domain or "").strip().lower()
        if slug in mappings.DOMAIN_KEYS and slug not in cleaned:
            cleaned.append(slug)
        elif slug:
            warnings.append(f"Unknown domain '{domain}' ignored.")

    if not cleaned:
        raise ValidationError(
            "Select at least one career domain before generating matches.",
            {"field": "core_domains"},
        )
    if len(cleaned) > 3:
        warnings.append("Only the first three domains were used.")
        cleaned = cleaned[:3]
    return cleaned, warnings


def validate_background(values: List[str]) -> Tuple[List[str], List[str]]:
    warnings: List[str] = []
    cleaned: List[str] = []
    for value in values or []:
        slug = (value or "").strip().lower()
        if slug in mappings.BACKGROUND_PROFILES and slug not in cleaned:
            cleaned.append(slug)
        elif slug:
            warnings.append(f"Unknown academic background '{value}' ignored.")
    return cleaned, warnings


def validate_school_subjects(values: List[str]) -> Tuple[List[str], List[str]]:
    warnings: List[str] = []
    cleaned: List[str] = []
    for value in values or []:
        slug = (value or "").strip().lower()
        if slug in mappings.SCHOOL_SUBJECT_PROFILES and slug not in cleaned:
            cleaned.append(slug)
        elif slug:
            warnings.append(f"Unknown school subject '{value}' ignored.")
    return cleaned, warnings


def validate_answers(
    answers: List[Dict[str, str]], domains: List[str], deep_scan: bool
) -> Tuple[List[Dict[str, str]], List[str]]:
    """Drop answers the server has never issued; require at least a few real ones."""
    warnings: List[str] = []
    cleaned: List[Dict[str, str]] = []
    seen_questions = set()

    for answer in answers or []:
        question_id = (answer.get("question_id") or "").strip()
        option_id = (answer.get("option_id") or "").strip()
        if question_bank.lookup_option(question_id, option_id) is None:
            warnings.append(f"Answer '{question_id}:{option_id}' is not in the question bank.")
            continue
        if question_id in seen_questions:
            continue            # last answer wins would be surprising; first wins
        seen_questions.add(question_id)
        cleaned.append({"question_id": question_id, "option_id": option_id})

    if not cleaned:
        raise InvalidQuestionnaireError(
            "No valid questionnaire answers were received, so a personalised "
            "ranking cannot be produced.",
            {"received": len(answers or [])},
        )

    expected = question_bank.build_question_set(domains, deep_scan)
    if len(cleaned) < max(3, len(expected) // 3):
        warnings.append(
            "Only part of the questionnaire was answered; confidence will be lower."
        )
    return cleaned, warnings
