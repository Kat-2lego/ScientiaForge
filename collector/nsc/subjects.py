"""Turn DBE headings + link titles into clean subject / paper metadata.

Real titles seen on the DBE pages (2023/2024):
  non-language subjects (heading = subject):
    "Paper 1 (English)", "Memo 1 (English)", "Memo 1 (Afrikaans and English)",
    "Paper 2 Answerbook (English & Afrikaans)", "Paper 1 Addendum (English)",
    "Data Files (MS Office)", "Civil Services Paper 1 (English)",
    "Digital Electronics Memo 1 (English)", "Digital Paper 1 (English)"
  language subjects (heading = language):
    "English FAL P1", "English FAL P1 memo", "Sesotho FAL P1 Nov Memo",
    "Afrikaans SAL P2 (Gauteng)", "Sepedi P2 SAL (Limpopo)", "SASL HL Paper 1",
    "SASL HL Memo 1", "SASL HL P1(ppt)"
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

LANGUAGE_HEADINGS = {
    "afrikaans": "Afrikaans",
    "english": "English",
    "isindebele": "isiNdebele",
    "isixhosa": "isiXhosa",
    "isizulu": "isiZulu",
    "sepedi": "Sepedi",
    "sesotho": "Sesotho",
    "setswana": "Setswana",
    "siswati": "Siswati",
    "tshivenda": "Tshivenda",
    "xitsonga": "Xitsonga",
    "sasl": "South African Sign Language",
    "south african sign language": "South African Sign Language",
    "south african sign language (final)": "South African Sign Language",
}

LEVELS = {
    "HL": "Home Language",
    "FAL": "First Additional Language",
    "SAL": "Second Additional Language",
}

SUBJECT_ALIASES = {
    "engineering graphic and design": "Engineering Graphics and Design",
    "engineering graphics & design": "Engineering Graphics and Design",
    "computer application technology": "Computer Applications Technology",
    "computer applications technology": "Computer Applications Technology",
    "physical science": "Physical Sciences",
    "life science": "Life Sciences",
    "maths": "Mathematics",
    "maths literacy": "Mathematical Literacy",
    "mathematics literacy": "Mathematical Literacy",
    "technical maths": "Technical Mathematics",
    "it": "Information Technology",
    "cat": "Computer Applications Technology",
    "egd": "Engineering Graphics and Design",
}

VARIANT_ALIASES = {
    "digital": "Digital Electronics",
    "digital electronics": "Digital Electronics",
    "electronics": "Electronics",
    "power systems": "Power Systems",
    "civil services": "Civil Services",
    "construction": "Construction",
    "woodworking": "Woodworking",
    "automotive": "Automotive",
    "fitting and machining": "Fitting and Machining",
    "welding and metalwork": "Welding and Metalwork",
}

PROVINCES = {
    "eastern cape", "free state", "gauteng", "kwazulu-natal", "kwazulu natal",
    "limpopo", "mpumalanga", "north west", "northern cape", "western cape",
}

_SMALL_WORDS = {"and", "of", "the", "in", "for", "a", "an", "on"}


def smart_title(text: str) -> str:
    words = re.split(r"(\s+)", text.strip())
    out = []
    for i, w in enumerate(words):
        if not w.strip():
            out.append(w)
            continue
        lw = w.lower()
        if i > 0 and lw in _SMALL_WORDS:
            out.append(lw)
        elif w.isupper() and len(w) <= 4:  # keep acronyms like IT, EGD
            out.append(w)
        else:
            out.append(lw[:1].upper() + lw[1:])
    return "".join(out)


def normalise_subject(heading: str) -> str:
    cleaned = re.sub(r"\s+", " ", heading or "").strip(" :-")
    key = cleaned.lower()
    return SUBJECT_ALIASES.get(key, smart_title(cleaned))


def is_language_heading(heading: str) -> bool:
    return (heading or "").strip().lower() in LANGUAGE_HEADINGS


@dataclass
class ParsedTitle:
    subject: str
    kind: str                    # paper | memo | answer_book | addendum | data | other
    paper_number: int
    doc_language: Optional[str]  # English | Afrikaans | Both | None (language subjects)
    province: Optional[str]
    is_language_subject: bool
    skip_reason: Optional[str] = None


def _parentheticals(title: str) -> list[str]:
    return [p.strip() for p in re.findall(r"\(([^)]*)\)", title)]


def _doc_language(parts: list[str]) -> Optional[str]:
    joined = " ".join(parts).lower()
    has_en, has_af = "english" in joined, "afrikaans" in joined
    if has_en and has_af:
        return "Both"
    if has_en:
        return "English"
    if has_af:
        return "Afrikaans"
    return None


def _province(parts: list[str]) -> Optional[str]:
    for p in parts:
        if p.lower() in PROVINCES:
            return p
    return None


def _kind(title: str) -> str:
    t = title.lower()
    if re.search(r"answer\s*-?\s*book", t):
        return "answer_book"
    if re.search(r"addend|annexure|insert|resource\s+booklet", t):
        return "addendum"
    if re.search(r"data\s*files?", t):
        return "data"
    if re.search(r"\bmemo|memorandum|marking\s+guideline|\bmg\b", t):
        return "memo"
    if re.search(r"\bpaper\b|\bp\s*\d\b|\bp\d", t):
        return "paper"
    return "other"


def _paper_number(title: str) -> Optional[int]:
    for pattern in (r"\bpaper\s*(\d)\b", r"\bmemo(?:randum)?\s*(\d)\b", r"\bp\s*(\d)\b", r"\bp(\d)"):
        m = re.search(pattern, title, flags=re.I)
        if m:
            return int(m.group(1))
    return None


def parse_title(heading: str, title: str) -> ParsedTitle:
    """Classify one document link found under `heading`."""
    title = re.sub(r"\s+", " ", title or "").strip()
    parts = _parentheticals(title)
    kind = _kind(title)
    number = _paper_number(title) or 1

    if is_language_heading(heading):
        language = LANGUAGE_HEADINGS[heading.strip().lower()]
        level_match = re.search(r"\b(HL|FAL|SAL)\b", title, flags=re.I)
        level = LEVELS[level_match.group(1).upper()] if level_match else "Home Language"
        parsed = ParsedTitle(
            subject=f"{language} {level}",
            kind=kind,
            paper_number=number,
            doc_language=None,
            province=_province(parts),
            is_language_subject=True,
        )
        if re.search(r"\bppt\b|powerpoint", title, flags=re.I):
            parsed.skip_reason = "presentation file"
        return parsed

    subject = normalise_subject(heading)
    # A variant is whatever precedes the document keyword, e.g.
    # "Civil Services Paper 1 (English)" -> "Civil Services".
    variant = None
    m = re.match(
        r"^(?P<variant>.*?)\s*\b(paper|memo|memorandum|marking guidelines?|p\s*\d)\b",
        re.sub(r"\([^)]*\)", "", title),
        flags=re.I,
    )
    if m and m.group("variant").strip():
        raw_variant = m.group("variant").strip(" -:").lower()
        variant = VARIANT_ALIASES.get(raw_variant, smart_title(raw_variant))
    if variant:
        subject = f"{subject}: {variant}"

    return ParsedTitle(
        subject=subject,
        kind=kind,
        paper_number=number,
        doc_language=_doc_language(parts),
        province=_province(parts),
        is_language_subject=False,
    )


def cover_subject_names() -> list[str]:
    """Upper-case subject names used to check a PDF cover page, longest first."""
    names = {
        "ACCOUNTING", "AGRICULTURAL MANAGEMENT PRACTICES", "AGRICULTURAL SCIENCES",
        "AGRICULTURAL TECHNOLOGY", "BUSINESS STUDIES", "CIVIL TECHNOLOGY",
        "COMPUTER APPLICATIONS TECHNOLOGY", "CONSUMER STUDIES", "DANCE STUDIES",
        "DESIGN", "DRAMATIC ARTS", "ECONOMICS", "ELECTRICAL TECHNOLOGY",
        "ENGINEERING GRAPHICS AND DESIGN", "GEOGRAPHY", "HISTORY",
        "HOSPITALITY STUDIES", "INFORMATION TECHNOLOGY", "LIFE ORIENTATION",
        "LIFE SCIENCES", "MARINE SCIENCES", "MATHEMATICAL LITERACY", "MATHEMATICS",
        "MECHANICAL TECHNOLOGY", "MUSIC", "PHYSICAL SCIENCES", "RELIGION STUDIES",
        "TECHNICAL MATHEMATICS", "TECHNICAL SCIENCES", "TOURISM", "VISUAL ARTS",
        "MARITIME ECONOMICS", "NAUTICAL SCIENCE", "SPORT AND EXERCISE SCIENCE",
    }
    for lang in set(LANGUAGE_HEADINGS.values()):
        for level in LEVELS.values():
            names.add(f"{lang} {level}".upper())
    return sorted(names, key=len, reverse=True)


def expected_cover_name(subject: str) -> str:
    base = subject.split(":")[0].strip()
    return base.upper()
