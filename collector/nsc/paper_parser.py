"""Split a question paper into numbered questions.

The key idea: question numbers must arrive in a *legal order*. After 2.3.1
the only legal next numbers are 2.3.1.1, 2.3.2, 2.4 or 3.1 (plus one
skipped number for tolerance). That filters out numbers that merely appear
in the text — "a distance of 2.5 m", "e.g. 1.11 E", "(1.1.1 to 1.1.10)".
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .patterns import (
    COVER_MARKS_RE,
    KEY_RE,
    QUESTION_RE,
    SECTION_RE,
    START_NEW_PAGE_RE,
    SUBTOTAL_RE,
    TOTAL_RE,
    TRAILER_RE,
    UNIT_OR_OPERATOR_RE,
    group_marks,
    key_str,
    key_tuple,
    reflow,
    strip_marks,
)
from .pdf_text import Row


@dataclass
class RawItem:
    key: tuple[int, ...]
    page: int
    section: Optional[str]
    rows: list[str] = field(default_factory=list)


@dataclass
class ParsedQuestion:
    number: str
    key: tuple[int, ...]
    top_question: int
    section: Optional[str]
    page: int
    text: str                      # question text (without options)
    context: Optional[str]         # stems / scenario this question depends on
    options: Optional[list[dict]]  # [{"label": "A", "text": "..."}]
    marks: Optional[int]


@dataclass
class ParsedPaper:
    questions: list[ParsedQuestion]
    all_keys: list[tuple[int, ...]]  # every numbered item (stems included), in reading order
    total_marks: Optional[int]
    warnings: list[str]


# --------------------------------------------------------------------------- #
def _successors(prev: Optional[tuple[int, ...]], top: Optional[int], gap: int = 1) -> set[tuple[int, ...]]:
    if prev is None or len(prev) == 1:
        base = prev[0] if prev else (top or 1)
        return {(base, k) for k in range(1, gap + 1)}
    out = {prev + (1,)} if len(prev) < 5 else set()
    for step in range(1, gap + 1):
        for i in range(len(prev) - 1, 0, -1):
            out.add(prev[:i] + (prev[i] + step,))
        out.add((prev[0] + step, 1))
    return out


_NUMERIC_REST_RE = re.compile(r"^[\d.,\s−\-–%°]+$")


def _accept_key(key, rest, prev, top, row: Optional[Row] = None) -> bool:
    # Question numbers live in the left-hand column; a "1.5" in the right half
    # of the page is a graph axis or diagram label.
    if row is not None and row.x0 > row.page_width * 0.45:
        return False
    if rest and _NUMERIC_REST_RE.match(rest):  # "1.5  2.0  2.5" -> axis values
        return False
    if key in _successors(prev, top, gap=1):
        return not (rest and UNIT_OR_OPERATOR_RE.match(rest))
    if key in _successors(prev, top, gap=2):
        # a skipped number is only believable if real question text follows
        return bool(rest) and bool(re.match(r"^[A-Z(“\"']", rest)) and not UNIT_OR_OPERATOR_RE.match(rest)
    return False


def segment(rows: list[Row], total_marks: Optional[int] = None):
    items: list[RawItem] = []
    intros: dict[int, list[str]] = {}
    titles: dict[int, str] = {}
    started = False
    section: Optional[str] = None
    top: Optional[int] = None
    prev: Optional[tuple[int, ...]] = None
    current: Optional[RawItem] = None

    def reset():
        nonlocal items, intros, titles, top, prev, current
        items, intros, titles, top, prev, current = [], {}, {}, None, None, None

    for row in rows:
        text = row.text.strip()
        if not text:
            continue

        sec = SECTION_RE.match(text)
        if sec:
            section = f"Section {sec.group(1)}"
            if started:
                current = None
            continue

        q = QUESTION_RE.match(text)
        if q:
            n = int(q.group(1))
            if n == 1 and not items:
                reset()
                started = True
            if started and (top is None or top < n <= top + 2):
                top, prev, current = n, (n,), None
                rest = START_NEW_PAGE_RE.sub("", q.group(2)).strip(" :.-–")
                if len(re.sub(r"[^A-Za-z]", "", rest)) >= 4:  # ignore stray page marks such as "NV"
                    titles[n] = rest
                intros.setdefault(n, [])
                continue
            if not started:
                continue

        if not started:
            # papers without "QUESTION n" headings: start at the first 1.1
            k = KEY_RE.match(text)
            if k and k.group(1) == "1.1" and row.page > 1:
                started, top, prev = True, 1, (1,)
            else:
                continue

        total = TOTAL_RE.match(text)
        if total and items and (total_marks is None or int(total.group(1)) == total_marks):
            break
        if TRAILER_RE.match(text) and items:
            break
        if SUBTOTAL_RE.match(text) or total:
            continue

        k = KEY_RE.match(text)
        if k:
            key = key_tuple(k.group(1))
            rest = k.group(2).strip()
            if _accept_key(key, rest, prev, top, row):
                if top is None or key[0] != top:
                    top = key[0]
                    intros.setdefault(top, [])
                current = RawItem(key=key, page=row.page, section=section, rows=[rest] if rest else [])
                items.append(current)
                prev = key
                continue

        if current is not None:
            current.rows.append(text)
        elif top is not None:
            intros.setdefault(top, []).append(text)

    return items, intros, titles


# --------------------------------------------------------------------------- #
_OPTION_START_RE = re.compile(r"^\(?([A-D])(?:[.)]\s*|\s+)(\S.*)?$")
_OPTION_SPLIT_RE = re.compile(r"\s{2,}(?=\(?[A-D](?:[.)]|\s))")


def _try_options(rows: list[str], start: int) -> Optional[tuple[list[dict], int]]:
    found: dict[str, list[str]] = {}
    last_letter = None
    for row in rows[start:]:
        pieces = _OPTION_SPLIT_RE.split(row)
        matched_any = False
        for piece in pieces:
            m = _OPTION_START_RE.match(piece.strip())
            if m:
                letter = m.group(1)
                if letter in found:
                    return None
                found[letter] = [m.group(2) or ""]
                last_letter = letter
                matched_any = True
            elif last_letter and piece.strip():
                found[last_letter].append(piece.strip())
                matched_any = True
        if not matched_any:
            return None
    letters = sorted(found)
    if letters not in (["A", "B", "C", "D"], ["A", "B", "C"]):
        return None
    options = [{"label": l, "text": re.sub(r"\s+", " ", " ".join(found[l])).strip()} for l in letters]
    if any(not o["text"] for o in options):
        return None  # options are pictures (graphs etc.)
    return options, start


def extract_options(rows: list[str]) -> tuple[list[str], Optional[list[dict]]]:
    """Return (stem_rows, options) — options only if a clean A–D set is found."""
    candidates = []
    for i, r in enumerate(rows):
        m = _OPTION_START_RE.match(r.strip())
        if m and m.group(1) == "A":
            candidates.append(i)
    # try the last "A" first: a stem that happens to start with "A ball ..." is not option A
    for start in reversed(candidates):
        result = _try_options(rows, start)
        if result:
            options, idx = result
            return rows[:idx], options
    return rows, None


# A "sentence" may contain periods between digits: "(1.3.1 to 1.3.2)" doesn't end it.
_SENTENCE_BODY = r"(?:[^.\n]|(?<=\d)\.(?=\d))*"
_INSTRUCTION_SENTENCE_RE = re.compile(
    _SENTENCE_BODY
    + r"\b(answer book|various options are provided|next to the question number|write only the|e\.g\.\s*\d|question numbers?\s*\()"
    + _SENTENCE_BODY
    + r"\.?",
    re.I,
)
_COLUMN_HEADER_LINE_RE = re.compile(r"^\s*COLUMN\s+I\s+COLUMN\s+II\s*$", re.I | re.M)
_A_ONLY_RE = re.compile(r"\bA\s+ONLY\b.*\bB\s+ONLY\b.*\bBOTH\s+A\s+AND\s+B\b", re.I | re.S)
# Split at the "A:" / "B:" marker itself. Real DBE tables often leave less than a
# double space between the description and its Column II cell.
_COLUMN_II_SPLIT_RE = re.compile(r"\s+(?=[AB]\s*:\s*\S)")

CONTEXT_PART_LIMIT = 1500
CONTEXT_LIMIT = 2500


def _clean_context(text: str) -> str:
    kept = []
    for line in text.split("\n"):
        cleaned = _COLUMN_HEADER_LINE_RE.sub("", _INSTRUCTION_SENTENCE_RE.sub("", line)).strip()
        if cleaned or not line.strip():  # drop lines emptied by stripping; keep real paragraph breaks
            kept.append(cleaned)
    text = "\n".join(kept)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip(" \n")
    return text if len(re.sub(r"[^A-Za-z]", "", text)) >= 4 else ""


def _leaf_marks(rows: list[str]) -> tuple[list[str], Optional[int], Optional[int]]:
    """Clean a leaf's rows and work out its marks.

    * marks printed next to text are summed — "(a) ... (1)" + "(b) ... (1)" = 2
    * a lone "(8)" after the question is the stem's total: only used when the
      question itself shows no marks
    * "(8 x 1)" gives per-item marks for the whole group (returned separately)
    """
    cleaned_rows: list[str] = []
    text_marks: list[int] = []
    lone_marks: list[int] = []
    per_item: Optional[int] = None
    for r in rows:
        gm = group_marks(r)
        if gm is not None:
            per_item = gm
        cleaned, m = strip_marks(r)
        if cleaned:
            cleaned_rows.append(cleaned)
            if m is not None:
                text_marks.append(m)
        elif m is not None:
            lone_marks.append(m)
    marks = sum(text_marks) if text_marks else (lone_marks[0] if lone_marks else None)
    return cleaned_rows, marks, per_item


def _split_column_ii(rows: list[str]) -> tuple[list[str], list[str]]:
    """Column I / Column II questions: separate "A: Oogenesis" / "B: ..." cells."""
    left: list[str] = []
    right: list[str] = []
    for r in rows:
        parts = _COLUMN_II_SPLIT_RE.split(r)
        if len(parts) > 1:
            left.append(parts[0])
            right.extend(p.strip() for p in parts[1:])
        elif re.match(r"^[AB]\s*:", r.strip()):
            right.append(r.strip())
        else:
            left.append(r)
    return left, right


def parse_question_paper(rows: list[Row], first_pages_text: str = "") -> ParsedPaper:
    warnings: list[str] = []
    m = COVER_MARKS_RE.search(first_pages_text or "")
    total_marks = int(m.group(1)) if m else None

    items, intros, titles = segment(rows, total_marks)
    if not items:
        return ParsedPaper([], [], total_marks, ["No numbered questions found"])

    keys = [it.key for it in items]
    key_set = set(keys)
    by_key = {it.key: it for it in items}

    def is_leaf(k):
        return not any(o != k and o[: len(k)] == k for o in key_set)

    def stem_text(k) -> str:
        parent = by_key.get(k)
        if not parent:
            return ""
        return reflow([strip_marks(r)[0] for r in parent.rows])

    # per-item marks announced anywhere in a group ("(10 x 2)") apply to all siblings
    group_item_marks: dict[tuple[int, ...], int] = {}
    prepared = {}
    for it in items:
        if not is_leaf(it.key):
            continue
        prepared[it.key] = _leaf_marks(it.rows)
        per_item = prepared[it.key][2]
        if per_item is not None:
            group_item_marks[it.key[:-1]] = per_item

    questions: list[ParsedQuestion] = []
    for it in items:
        if it.key not in prepared:
            continue
        rows_clean, marks, _ = prepared[it.key]
        if marks is None:
            marks = group_item_marks.get(it.key[:-1])

        top = it.key[0]
        stems = [stem_text(it.key[:depth]) for depth in range(2, len(it.key))]
        column_ii: list[str] = []
        if any(_A_ONLY_RE.search(st) for st in stems):
            rows_clean, column_ii = _split_column_ii(rows_clean)

        stem_rows, options = extract_options(rows_clean)
        text = reflow(stem_rows)
        if column_ii:
            text = f"{text}\n\n" + "\n".join(column_ii)

        context_parts: list[str] = []
        intro_bits = []
        if titles.get(top):
            intro_bits.append(titles[top])
        intro_text = reflow([strip_marks(r)[0] for r in intros.get(top, [])])
        if intro_text:
            intro_bits.append(intro_text)
        if intro_bits:
            context_parts.append("\n".join(intro_bits)[:CONTEXT_PART_LIMIT])
        for st in stems:
            if st:
                context_parts.append(st[:CONTEXT_PART_LIMIT])
        context = _clean_context("\n\n".join(context_parts))[:CONTEXT_LIMIT] or None

        if not text and not options:
            warnings.append(f"{key_str(it.key)}: empty question text")
            continue

        questions.append(
            ParsedQuestion(
                number=key_str(it.key),
                key=it.key,
                top_question=top,
                section=it.section,
                page=it.page,
                text=text,
                context=context,
                options=options,
                marks=marks,
            )
        )
    return ParsedPaper(questions, keys, total_marks, warnings)
