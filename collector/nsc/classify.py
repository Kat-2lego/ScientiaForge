"""Decide what kind of question each one is and how (or whether) it can be marked.

Rules are deliberately conservative: a question is only auto-markable when
the memo gives a short, unambiguous answer (a letter, True/False, a term,
or a final numeric value). Everything else that is still sensible to
answer from memory is *self-marked* — the student compares their answer
with the memo. Questions that depend on a diagram, graph, source or
passage are kept in the database but left out of Active Recall.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .memo_parser import MemoAnswer
from .paper_parser import ParsedQuestion

FIGURE_RE = re.compile(
    r"\b(diagrams?|graphs?|figure|fig\.|sketch(?:ed)?|photographs?|photo|pictures?|cartoons?|maps?"
    r"|illustration|images?|table\s+\d|the\s+table|source\s+[A-Z0-9]\b|addendum|annexure|appendix"
    r"|extract\s+[A-Z0-9]\b|text\s+[A-Z]\b|passage|stanza|poem|advertisement|paragraph\s+\d"
    r"|lines?\s+\d|labell?ed\s+[A-Z]\b|parts?\s+[A-Z]\b|structures?\s+[A-Z]\b|shown\s+(?:below|above)"
    r"|given\s+(?:below|above)|the\s+(?:circuit|graph|diagram|figure|photograph|sketch)\b|case\s+study)",
    re.I,
)
DRAW_RE = re.compile(
    r"^\s*(draw|sketch|plot|construct|complete\s+the\s+(table|diagram|graph)|label|shade|tabulate|illustrate)\b",
    re.I,
)
# A question that points at something outside its own words ("this investigation", "in QUESTION 2.5.1"),
# or at data ("day 8", "(in µm)"), can't be answered without the paper in front of you.
REFERENCE_RE = re.compile(
    r"\b(this|these|those|above|below|shown|given|identified|represented|indicated|observed|letters?)\b"
    r"|\bthe\s+(investigation|experiment|data|results?|information|passage|extract|source|scenario|learner|female|male"
    r"|man|woman|group|patient|person|table|graph|diagram)\b"
    r"|\bquestion\s+\d|\baccording\s+to\b|\bfrom\s+the\b|\(\s*[A-Z]\s+(?:or|and)\s+[A-Z]\s*\)",
    re.I,
)
DATA_RE = re.compile(
    r"\d|\(in\s|\bpercent(?:age)?\b|\bday\s|\bcalculate\b|\bdifference\s+between\b|\b(?:highest|lowest|maximum|minimum)\b",
    re.I,
)


# Letters that name parts of a picture: "part B", "(X or Y)", "(a) A", "Identify part: ..." (case-sensitive on purpose)
LABEL_RE = re.compile(r"(?<![A-Za-z0-9])[B-HX-Z](?![A-Za-z0-9\u2019'\-])|\(\s*[a-z]\s*\)\s*A(?![A-Za-z])")
IDENTIFY_PART_RE = re.compile(r"\bidentify\s+(the\s+)?(parts?|structures?)\b", re.I)


def standalone_question(text: str) -> bool:
    """True when the question can be answered from what the student knows, whatever figure sits nearby."""
    t = (text or "").strip()
    return (
        len(t) >= 25
        and not REFERENCE_RE.search(t)
        and not DATA_RE.search(t)
        and not LABEL_RE.search(t)
        and not IDENTIFY_PART_RE.search(t)
    )


def _is_label_line(line: str) -> bool:
    """Words printed on a diagram ("A C Endometrium B", "Less TSH ... GLAND Y PITUITARY GLAND") come out of the
    PDF as a line with no sentence punctuation and stray single capital letters."""
    s = line.strip()
    if re.search(r"[.?!:]", s):
        return False
    single_caps = sum(1 for tok in s.split() if re.fullmatch(r"\(?[A-Z]\)?", tok))
    return single_caps >= 1 or len(s) < 40


def drop_label_lines(context: str) -> str:
    return "\n".join(ln for ln in (context or "").split("\n") if ln.strip() and not _is_label_line(ln)).strip()


def strip_figure_context(context: str) -> Optional[str]:
    """Keep the lines of a stem that don't point at a figure ("Study the diagram below...")."""
    lines = [ln for ln in (context or "").split("\n") if ln.strip() and not FIGURE_RE.search(ln)]
    kept = "\n".join(lines).strip()
    return kept if len(re.sub(r"[^A-Za-z]", "", kept)) >= 6 else None


TRUE_FALSE_RE = re.compile(r"true\s*(or|/)\s*false", re.I)
MATCHING_RE = re.compile(r"column\s+a\b.*column\s+b\b|column\s+b\b.*column\s+a\b", re.I | re.S)
TERM_CONTEXT_RE = re.compile(
    r"(one\s+(word|term)|word\s*/\s*term|term\s*/\s*phrase|word\s*\(s\)|biological\s+term|correct\s+term"
    r"|economic\s+term|business\s+term|geographical\s+term|accounting\s+term|appropriate\s+term"
    r"|the\s+term\s+for|name\s+the\s+term|complete\s+the\s+following\s+statements?|give\s+the\s+correct)",
    re.I,
)
CALC_VERB_RE = re.compile(
    r"^\s*(calculate|determine|solve|simplify|evaluate|compute|find|factori[sz]e|expand|how\s+many|how\s+much"
    r"|write\s+down\s+the\s+(value|coordinates|equation)|what\s+is\s+the\s+value)",
    re.I,
)
PROOF_RE = re.compile(r"^\s*(prove|show\s+that|verify|derive)", re.I)
EXPRESSION_VERB_RE = re.compile(r"^\s*(factori[sz]e|simplify|expand)", re.I)
SHORT_VERB_RE = re.compile(
    r"^\s*(name|state|give|identify|write\s+down|which|what|who|when|where|list|mention)\b", re.I
)
LONG_VERB_RE = re.compile(r"\b(explain|describe|discuss|why|evaluate|justify|motivate|compare|analyse|analyze|suggest|comment)\b", re.I)
MULTIPLE_ITEMS_RE = re.compile(r"\b(TWO|THREE|FOUR|FIVE|SIX)\b")
SUB_PARTS_RE = re.compile(r"(^|\n)\s*\(b\)", re.I)
CORRECTION_RE = re.compile(r"(correct|replace)\s+(the\s+)?(underlined\s+)?(word|term)", re.I)
A_ONLY_CONTEXT_RE = re.compile(r"\bA\s+ONLY\b.*\bB\s+ONLY\b.*\bBOTH\s+A\s+AND\s+B\b", re.I | re.S)
_A_ONLY_ANSWERS = (
    ("A only", re.compile(r"^a\s*only$", re.I)),
    ("B only", re.compile(r"^b\s*only$", re.I)),
    ("Both A and B", re.compile(r"^both(\s*a\s*and\s*b)?$", re.I)),
    ("None", re.compile(r"^(none|neither)(\s+of\s+the\s+items)?$", re.I)),
)
ANY_N_RE = re.compile(r"\(\s*any\s+\d", re.I)

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "their", "they", "them", "which",
    "when", "what", "will", "have", "has", "are", "was", "were", "been", "being", "its", "of", "to",
    "in", "on", "a", "an", "or", "by", "as", "is", "be", "it", "at", "accept", "mark", "only", "first",
}

_SCI_RE = re.compile(r"(\d(?:[.,]\d+)?)\s*[×xX]\s*10\s*\^?\s*([⁻\-−]?[⁰¹²³⁴⁵⁶⁷⁸⁹\d]+)")
_SUP_DIGITS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻", "0123456789-")
_NUMBER_PART_RE = re.compile(
    r"^(?:R\s?)?[-−]?\d+(?:[.,]\d+)?(?:e[-−]?\d+)?"
    r"(?P<unit>\s*%|\s*°\s*C?|\s+[A-Za-zµμΩℓ°·/\-−⁻⁰¹²³⁴⁵⁶⁷⁸⁹\d^.\s]{1,30})?$"
)


@dataclass
class Classification:
    question_type: str
    answer_format: str
    accepted_answer: Optional[str]
    alternatives: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    is_auto_markable: bool = False
    is_recall_suitable: bool = False
    has_figure: bool = False
    options: Optional[list[dict]] = None  # set when the answer choices come from the instructions
    reasons: list[str] = field(default_factory=list)
    context_changed: bool = False          # True when figure-related context was removed
    context_text: Optional[str] = None     # the context to store when context_changed


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def _normalise_number_text(s: str) -> str:
    s = s.replace("−", "-").replace("–", "-")
    s = _SCI_RE.sub(lambda m: f"{m.group(1)}e{m.group(2).translate(_SUP_DIGITS)}", s)
    s = re.sub(r"(?<=\d) (?=\d{3}(?!\d))", "", s)  # 1 250,50 -> 1250,50
    return s.strip()


def numeric_answer_parts(text: str) -> Optional[list[str]]:
    """'x = 2 or x = -3' -> ['2', '-3'];  'a = 8 m·s-2' -> ['8 m·s-2'];  None if not purely numeric."""
    if not text or re.search(r"[<>≤≥]", text):
        return None
    t = re.sub(r"^[∴\s]+", "", text.strip())
    parts = re.split(r"\s+or\s+|\s+and\s+|;|,\s+(?=[A-Za-z(]\s*=)", t, flags=re.I)
    values = []
    for part in parts:
        value = part.split("=")[-1].strip().rstrip(".")
        value = _normalise_number_text(value)
        if not value:
            return None
        m = _NUMBER_PART_RE.match(value)
        if not m:
            return None
        unit = (m.group("unit") or "").strip()
        if unit and (len(unit.split()) > 4 or re.search(r"[=+()]", unit)):
            return None
        values.append(value)
    return values or None


def _final_line(rows: list[str]) -> Optional[str]:
    for row in reversed(rows):
        if "=" in row and re.search(r"\d", row.split("=")[-1]):
            return re.sub(r"^[∴\s]+", "", row).strip()
    return None


_OPTIONAL_WORDS_RE = re.compile(r"\(([^()]{1,30})\)")
_NOTE_RE = re.compile(r"\((?:mark|accept|any|do not|note|only)[^)]*\)|\b(?:accept|mark first)\b.*$", re.I)


def _expand_alternatives(raw: str) -> list[str]:
    raw = _NOTE_RE.sub("", raw).strip(" .;:-–•")
    pieces = re.split(r"\s*/\s*|\s+OR\s+|\s*;\s*", raw)
    out: list[str] = []
    for p in pieces:
        p = p.strip(" .,-–•\"'“”")
        if not p:
            continue
        if _OPTIONAL_WORDS_RE.search(p):
            with_words = _OPTIONAL_WORDS_RE.sub(r"\1", p)
            without = _OPTIONAL_WORDS_RE.sub("", p)
            candidates = [with_words, without]
        else:
            candidates = [p]
        for c in candidates:
            c = re.sub(r"\s+", " ", c).strip(" .,-–")
            if c and c.lower() not in (o.lower() for o in out):
                out.append(c)
    return out


def _keywords(text: str) -> list[str]:
    words = re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]{3,}", text or "")
    seen: list[str] = []
    for w in words:
        lw = w.lower()
        if lw not in STOPWORDS and lw not in seen:
            seen.append(lw)
    return seen[:8]


def _word_count(s: str) -> int:
    return len(re.findall(r"\S+", s or ""))


def looks_garbled(text: str) -> bool:
    if "\ufffd" in (text or ""):
        return True
    lines = [l for l in (text or "").split("\n") if l.strip()]
    if len(lines) >= 4:
        short = sum(1 for l in lines if len(l.strip()) <= 3)
        if short / len(lines) > 0.35:
            return True
    return False


_MATH_OPERATOR_RE = re.compile(r"[=+−×÷^]")
_BROKEN_DECIMAL_RE = re.compile(r"(?:^|\s)[,.]\d")          # "1,71" printed as ",1 71"
_LOST_SUPERSCRIPT_RE = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]\s\d(?![\d,.])")  # "x²" printed as "x 2"
_STRAY_PAREN_RE = re.compile(r"[+−×÷=]\s*\)|\)\d")       # "( x + )1" : pieces of one equation out of order


def memo_looks_garbled(text: str) -> Optional[str]:
    """Word equations are stored as loose fragments in DBE Maths/Science memos, so the
    extracted line can be wrong ("x = ,1 71" for 1,71). Never mark against those."""
    if not text:
        return None
    for line in text.split("\n"):
        if not _MATH_OPERATOR_RE.search(line):
            continue
        if _BROKEN_DECIMAL_RE.search(line):
            return "broken decimal in the memo equation"
        if _LOST_SUPERSCRIPT_RE.search(line):
            return "lost superscript in the memo equation"
        if _STRAY_PAREN_RE.search(line):
            return "memo equation pieces out of order"
    return None


def _strip_bullet(row: str) -> str:
    return re.sub(r"^\s*([-•▪●◦*˗–]|\(?[a-z]\)|\d+[.)])\s*", "", row).strip()


def _last_sentence(text: str) -> str:
    parts = [p for p in re.split(r"(?<=[.?!])\s+|\n", text or "") if p.strip()]
    return parts[-1].strip() if parts else ""


def _a_only_answer(first_row: str) -> Optional[str]:
    cleaned = re.sub(r"[\s.]+", " ", first_row or "").strip()
    for canonical, pattern in _A_ONLY_ANSWERS:
        if pattern.match(cleaned):
            return canonical
    return None


# --------------------------------------------------------------------------- #
def classify(q: ParsedQuestion, memo: Optional[MemoAnswer]) -> Classification:
    text = q.text or ""
    context = q.context or ""
    combined = f"{context}\n{text}"
    memo_rows = memo.rows if memo else []
    memo_text = memo.text if memo else ""
    first_row = memo_rows[0] if memo_rows else ""

    own_figure = bool(FIGURE_RE.search(text)) or bool(DRAW_RE.search(text))
    context_figure = bool(FIGURE_RE.search(context))
    # Only the section has a figure, the question itself doesn't need it: keep it, minus the figure context.
    loose = context_figure and not own_figure and not q.options and standalone_question(text)
    has_figure = own_figure or context_figure
    blocked_by_figure = own_figure or (context_figure and not loose)
    c = Classification(question_type="other", answer_format="text", accepted_answer=None, has_figure=has_figure)
    display_context: Optional[str] = drop_label_lines(context) or None
    if loose:
        display_context = strip_figure_context(display_context or "")
    if display_context != (context or None):
        c.context_changed = True
        c.context_text = display_context

    multi_part = bool(SUB_PARTS_RE.search(text)) or sum(1 for r in memo_rows if re.match(r"^\s*\([a-e]\)", r)) > 1

    # 1. Multiple choice -------------------------------------------------------
    letter = re.match(r"^\s*\(?([A-D])\)?(?![A-Za-z])", first_row) if first_row else None
    a_only = _a_only_answer(first_row) if A_ONLY_CONTEXT_RE.search(context) else None
    if a_only:
        # "Write A only, B only, both A and B or none" — the choices are given by the paper
        choices = ["A only", "B only", "Both A and B"]
        if re.search(r"\bNONE\b", context, re.I):
            choices.append("None")
        c.question_type = "multiple_choice"
        c.answer_format = "term"
        c.options = [{"label": ch, "text": ch} for ch in choices]
        c.accepted_answer = a_only
        c.is_auto_markable = a_only in choices
    elif q.options:
        c.question_type = "multiple_choice"
        c.answer_format = "letter"
        if letter:
            c.accepted_answer = letter.group(1)
            c.is_auto_markable = True
        else:
            c.reasons.append("memo letter not found")
    elif letter and len(first_row) <= 4 and MATCHING_RE.search(combined):
        c.question_type = "other"
        c.reasons.append("matching columns are not extracted")
    elif letter and len(first_row) <= 4:
        c.question_type = "multiple_choice"
        c.answer_format = "letter"
        c.reasons.append("options could not be extracted")

    # 2. True / false ------------------------------------------------------------
    elif TRUE_FALSE_RE.search(combined) and re.match(r"^\s*(true|false)\b", first_row, re.I):
        c.question_type = "true_false"
        c.answer_format = "boolean"
        c.accepted_answer = "True" if first_row.strip().lower().startswith("true") else "False"
        # "If FALSE, write the correct word" — the correction can't be auto-marked
        c.is_auto_markable = c.accepted_answer == "True" or not CORRECTION_RE.search(combined)

    # 3. One word / term ---------------------------------------------------------
    elif TERM_CONTEXT_RE.search(combined) and first_row and not multi_part and _word_count(first_row) <= 8 and len(memo_rows) <= 3:
        alternatives = _expand_alternatives(" / ".join(_strip_bullet(r) for r in memo_rows if not r.lower().startswith("note")))
        c.question_type = "short_answer"
        c.answer_format = "term"
        if alternatives and all(_word_count(a) <= 5 for a in alternatives):
            c.accepted_answer = alternatives[0]
            c.alternatives = alternatives[1:]
            c.keywords = _keywords(alternatives[0])
            c.is_auto_markable = True

    # 4. Calculations / algebra ----------------------------------------------------
    elif CALC_VERB_RE.search(text) or CALC_VERB_RE.search(_last_sentence(text)) or (
        CALC_VERB_RE.search(context.split("\n")[-1] if context else "") and len(text) < 80
    ):
        c.question_type = "calculation"
        if PROOF_RE.search(text):
            c.reasons.append("proof — self-marked")
        elif multi_part:
            pass  # several answers: self-marked
        elif len(memo_rows) == 1 and numeric_answer_parts(first_row):
            c.question_type = "numerical"
            c.answer_format = "number"
            c.accepted_answer = first_row
            c.is_auto_markable = True
        elif EXPRESSION_VERB_RE.search(text) and len(memo_rows) <= 2 and memo_rows:
            expr = memo_rows[-1].split("=")[-1].strip()
            if expr and len(expr) <= 40 and re.search(r"[a-z]", expr) and re.fullmatch(r"[a-z0-9+\-−()²³⁴^/ .·×]+", expr):
                c.answer_format = "expression"
                c.accepted_answer = expr
                c.is_auto_markable = True
        elif memo_rows and len(memo_rows) <= 8:
            final = _final_line(memo_rows)
            if final and numeric_answer_parts(final):
                c.answer_format = "number"
                c.accepted_answer = final
                c.is_auto_markable = True

    # 5. Short factual answers ----------------------------------------------------------
    elif SHORT_VERB_RE.search(text) and not LONG_VERB_RE.search(text) and memo_rows:
        c.question_type = "short_answer"
        c.answer_format = "term"
        wants_many = bool(MULTIPLE_ITEMS_RE.search(text)) or bool(ANY_N_RE.search(memo_text))
        if len(memo_rows) == 1 and numeric_answer_parts(first_row) and not multi_part:
            c.question_type = "numerical"
            c.answer_format = "number"
            c.accepted_answer = first_row
            c.is_auto_markable = True
            wants_many = True  # skip the term handling below
        options_rows = [_strip_bullet(r) for r in memo_rows if not r.lower().startswith(("note", "(mark", "mark"))]
        alternatives = _expand_alternatives(" / ".join(options_rows)) if options_rows else []
        if (
            not wants_many
            and not multi_part
            and alternatives
            and len(alternatives) <= 6
            and all(_word_count(a) <= 3 for a in alternatives)
        ):
            c.accepted_answer = alternatives[0]
            c.alternatives = alternatives[1:]
            c.keywords = _keywords(alternatives[0])
            c.is_auto_markable = True
        elif c.answer_format != "number":
            c.answer_format = "text"

    garbled_memo = memo_looks_garbled(memo_text)
    if garbled_memo:
        c.is_auto_markable = False
        c.accepted_answer = None
        c.alternatives = []
        c.answer_format = "text"

    # 6. Everything else: self-marked --------------------------------------------------
    if c.question_type == "other" and memo_rows:
        c.keywords = _keywords(memo_text)[:6]

    # Suitability for Active Recall ---------------------------------------------------
    if not memo or not memo_text:
        c.reasons.append("no memo answer")
    if garbled_memo:
        c.reasons.append(f"memo text is unreliable ({garbled_memo})")
    if blocked_by_figure:
        c.reasons.append("depends on a figure, table or source")
    if len(text) < 8 and not q.options:
        c.reasons.append("question text too short")
    if len(text) > 1500:
        c.reasons.append("question text too long")
    if looks_garbled(text) or looks_garbled("\n".join(o["text"] for o in (q.options or []))):
        c.reasons.append("text extraction looks garbled")
    if not c.is_auto_markable and len(memo_text) > 900:
        c.reasons.append("memo answer too long to self-mark comfortably")
    if c.question_type == "multiple_choice" and not (q.options or c.options):
        c.reasons.append("options missing")

    blocking = [r for r in c.reasons if r not in ("proof — self-marked",)]
    c.is_recall_suitable = not blocking
    if not c.is_recall_suitable:
        c.is_auto_markable = c.is_auto_markable and bool(memo_text)
    return c
