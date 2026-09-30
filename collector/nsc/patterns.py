"""Regexes and small helpers shared by the paper and memo parsers."""
from __future__ import annotations

import re
from typing import Optional

# "1.1", "2.3.1", "4.2.1.3" at the start of a row (followed by space or end)
KEY_RE = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){1,4})(?=\s|$)\s*(.*)$")
# the same, but anywhere after a column gap (two or more spaces)
EMBEDDED_KEY_RE = re.compile(r"(?:^|(?<=\s\s))(\d{1,2}(?:\.\d{1,2}){1,4})(?=\s|$)")

QUESTION_RE = re.compile(r"^QUESTION\s+(\d{1,2})\b[\s:.\-–]*(.*)$")
SECTION_RE = re.compile(r"^SECTION\s+([A-E])\b[\s:.\-–]*(.*)$")
TOTAL_RE = re.compile(r"^(?:GRAND\s+)?TOTAL\s*:\s*(\d{2,3})\s*$")
# "TOTAL SECTION A: 50", "TOTAL QUESTION 2: 35", "SUBTOTAL: 12"
SUBTOTAL_RE = re.compile(r"^(?:SUB\s*)?TOTAL\s+(?:FOR\s+)?(?:SECTION|QUESTION|AFDELING|VRAAG)\b.*$|^SUBTOTAL\b.*$", re.I)
# "(10 x 2)" — every item in the group is worth 2 marks
GROUP_MARKS_RE = re.compile(r"\(\s*(\d{1,2})\s*[x×]\s*(\d{1,2})\s*\)")
TRAILER_RE = re.compile(
    r"^(DATA\s+FOR\s+|DATA\s+SHEET|INFORMATION\s+SHEET|FORMULA\s+SHEET|LIST\s+OF\s+FORMULAE)",
    re.I,
)
START_NEW_PAGE_RE = re.compile(r"\(?\s*start\s+on\s+a\s+new\s+page\.?\s*\)?", re.I)

MARKS_AT_END_RE = re.compile(r"\(\s*(\d{1,2})\s*\)\s*$")
TOTAL_AT_END_RE = re.compile(r"\[\s*\d{1,3}\s*\]\s*$")
COVER_MARKS_RE = re.compile(r"MARKS\s*:\s*(\d{2,3})", re.I)

# Text that follows a number but is really a unit / operator, e.g. "2.3 m up the incline".
_LOWER_UNIT = r"(?:m|km|cm|mm|nm|g|kg|mg|s|ms|h|min|mol|dm|ℓ|L|Pa|kPa|Hz|eV|°C|°|%)"
_UPPER_UNIT = r"(?:N|J|W|V|A|K|C|Ω|T|F)"
UNIT_OR_OPERATOR_RE = re.compile(
    rf"^(?:{_LOWER_UNIT}(?=$|[\s·./,;)]\s*(?:[a-z(]|$|[·/]))|{_UPPER_UNIT}(?=$|[·/\d])|[=×+\-−*/·^<>≤≥])"
)


def key_tuple(key: str) -> tuple[int, ...]:
    return tuple(int(p) for p in key.split("."))


def key_str(key: tuple[int, ...]) -> str:
    return ".".join(str(p) for p in key)


def strip_marks(text: str) -> tuple[str, Optional[int]]:
    """Remove a trailing "(2)" / "[20]" from a row, returning (clean_text, marks).

    Rows carrying a group allocation such as "(10 x 2) (20)" return no marks:
    the (20) is the total for the whole group, see group_marks().
    """
    marks = None
    t = TOTAL_AT_END_RE.sub("", text).rstrip()
    m = MARKS_AT_END_RE.search(t)
    if m:
        marks = int(m.group(1))
        t = t[: m.start()].rstrip()
    t = TOTAL_AT_END_RE.sub("", t).rstrip()
    if GROUP_MARKS_RE.search(t):
        marks = None
        t = GROUP_MARKS_RE.sub("", t).rstrip()
        t = re.sub(r"\bAny\s*$", "", t).rstrip()
    return t, marks


def group_marks(text: str) -> Optional[int]:
    """Per-item marks from "(8 x 1)" in a row, if present."""
    m = GROUP_MARKS_RE.search(text or "")
    return int(m.group(2)) if m else None


def reflow(rows: list[str]) -> str:
    """Join visual rows into readable paragraphs, keeping deliberate line breaks."""
    out: list[str] = []
    for raw in rows:
        row = re.sub(r"[ \t]{2,}", "  ", raw.strip())
        if not row:
            continue
        if not out:
            out.append(row)
            continue
        prev = out[-1]
        starts_new = bool(re.match(r"^([-•▪●◦*]|\(?[a-z]\)|\(?[ivx]+\)|\d+[.)]\s)", row))
        # "B ONLY, BOTH A AND B ..." after "... apply to A ONLY," continues the
        # sentence; a capital letter only starts a new item after a finished line
        mid_sentence = bool(re.search(r"(,|\b(and|or|to|of|the|a|an|in|on|by|with|for|from))$", prev, re.I))
        if not starts_new and re.match(r"^[A-H]\s", row) and not mid_sentence:
            starts_new = True
        prev_closed = bool(re.search(r"[.:;?!)]$", prev)) or len(prev) < 45
        # a wrapped line in a narrow column: "A process that produces four" / "mature gametes ..."
        continues = row[:1].islower() and not re.search(r"[.:;?!]$", prev)
        if (starts_new or prev_closed) and not continues:
            out.append(row)
        else:
            out[-1] = f"{prev} {row}"
    return "\n".join(out).strip()


def collapse_ws(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text or "").strip()
