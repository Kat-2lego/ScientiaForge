"""Split a memorandum (marking guideline) into answers keyed by question number.

Memos are segmented using the question numbers we already found in the
question paper, so a number only starts a new answer if the paper really
has that question. Two-column MCQ tables ("1.1 B ✓✓   1.6 A ✓✓") are split
on the column gap.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .patterns import (
    EMBEDDED_KEY_RE,
    GROUP_MARKS_RE,
    KEY_RE,
    MARKS_AT_END_RE,
    QUESTION_RE,
    SECTION_RE,
    SUBTOTAL_RE,
    TOTAL_AT_END_RE,
    TOTAL_RE,
    UNIT_OR_OPERATOR_RE,
    collapse_ws,
    key_str,
    key_tuple,
)
from .pdf_text import TICK, Row

MATHS_SUBJECTS = ("mathematics", "mathematical literacy", "technical mathematics")


@dataclass
class MemoAnswer:
    number: str
    page: int
    raw_rows: list[str] = field(default_factory=list)
    rows: list[str] = field(default_factory=list)  # cleaned
    marks: Optional[int] = None

    @property
    def text(self) -> str:
        return "\n".join(self.rows).strip()


# --------------------------------------------------------------------------- #
_TICK_NORMALISE_RE = re.compile(r"[✔✓]|√(?![\w(])")
_MATH_DESCRIPTOR_TAIL_RE = re.compile(r"✓+\s*[A-Za-z][A-Za-z ,/'’()&-]{0,48}$")
_MARK_CODE_RE = re.compile(r"✓+\s*(?:CA|A|M|S|R|F|RT|SF|P)\b")


_ANY_TAIL_RE = re.compile(r"\s*\bAny\b\s*$")


def _drop_descriptor_cells(t: str) -> str:
    """Maths memos have a right-hand column of mark descriptors: "✓ factors",
    "✓ subst", "✓ answer". They sit after a column gap and start with a tick.
    A tick-led cell that continues the answer ("✓ or x = 3") is kept."""
    cells = re.split(r"\s{2,}", t)
    while len(cells) > 1 and cells[-1].lstrip().startswith(TICK):
        after = cells[-1].lstrip(TICK + " ")
        if re.match(r"^(or|and|;|,)\b", after, re.I):
            break
        cells.pop()
    return "  ".join(cells)


def clean_memo_row(row: str, maths_style: bool) -> tuple[str, Optional[int]]:
    marks = None
    t = _TICK_NORMALISE_RE.sub(TICK, row)
    t = TOTAL_AT_END_RE.sub("", t).rstrip()
    m = MARKS_AT_END_RE.search(t)
    if m:
        marks = int(m.group(1))
        t = t[: m.start()].rstrip()
    if GROUP_MARKS_RE.search(t):  # "(10 x 2) (20)" is a group total, not this answer's marks
        marks = None
        t = GROUP_MARKS_RE.sub("", t).rstrip()
    t = _ANY_TAIL_RE.sub("", t)
    if maths_style:
        t = _drop_descriptor_cells(t)
        # right-hand column of maths memos: "✓ answer", "✓ factors", "✓ CA"
        t = _MATH_DESCRIPTOR_TAIL_RE.sub("", t)
        t = _MARK_CODE_RE.sub("", t)
    t = re.sub(rf"\s*{TICK}+", "", t)
    t = TOTAL_AT_END_RE.sub("", t)
    t = collapse_ws(t.replace("  ", " "))
    t = _ANY_TAIL_RE.sub("", t)
    if re.fullmatch(r"[\W_]*", t):
        t = ""
    return t, marks


_STEM_CHILD_RE = re.compile(r"^(\d{1,2}(?:\.\d{1,2}){1,3})\s+(\d{1,2}(?:\.\d{1,2}){2,4})(?=\s|$)")


def _split_row(text: str, key_set: set[tuple[int, ...]]) -> list[str]:
    cuts = [m.start(1) for m in EMBEDDED_KEY_RE.finditer(text) if key_tuple(m.group(1)) in key_set]
    # "1.1 1.1.1  D" — a stem number immediately followed by its first sub-question
    sc = _STEM_CHILD_RE.match(text)
    if sc:
        parent, child = key_tuple(sc.group(1)), key_tuple(sc.group(2))
        if child[: len(parent)] == parent and child in key_set:
            cuts.append(sc.start(2))
    if not cuts or cuts[0] != 0:
        cuts = [0] + cuts
    cuts = sorted(set(cuts))
    return [text[a:b].strip() for a, b in zip(cuts, cuts[1:] + [len(text)]) if text[a:b].strip()]


def parse_memo(rows: list[Row], qp_keys: list[tuple[int, ...]], subject: str) -> dict[str, MemoAnswer]:
    if not qp_keys:
        return {}
    key_set = set(qp_keys)
    order = {k: i for i, k in enumerate(qp_keys)}
    first_top = qp_keys[0][0]
    maths_style = subject.split(":")[0].strip().lower() in MATHS_SUBJECTS

    answers: dict[tuple[int, ...], MemoAnswer] = {}
    current: Optional[MemoAnswer] = None
    last_idx = -1
    started = False

    for row in rows:
        text = row.text.strip()
        if not text:
            continue
        if not started:
            q = QUESTION_RE.match(text)
            k = KEY_RE.match(text)
            if q and int(q.group(1)) == first_top:
                started = True
                continue
            if k and key_tuple(k.group(1)) == qp_keys[0]:
                started = True
            else:
                continue

        if QUESTION_RE.match(text) or SECTION_RE.match(text):
            continue
        if TOTAL_RE.match(text) or SUBTOTAL_RE.match(text):
            continue

        fragments = _split_row(text, key_set)
        multi = sum(1 for f in fragments if KEY_RE.match(f) and key_tuple(KEY_RE.match(f).group(1)) in key_set) > 1

        for frag in fragments:
            k = KEY_RE.match(frag)
            if k:
                key = key_tuple(k.group(1))
                rest = k.group(2).strip()
                if key in key_set and key not in answers:
                    idx = order[key]
                    looks_like_value = bool(rest) and bool(UNIT_OR_OPERATOR_RE.match(rest))
                    if multi or idx == last_idx + 1 or (idx > last_idx and not looks_like_value):
                        current = MemoAnswer(number=key_str(key), page=row.page)
                        if rest:
                            current.raw_rows.append(rest)
                        answers[key] = current
                        last_idx = max(last_idx, idx)
                        continue
            if current is not None:
                current.raw_rows.append(frag)

    result: dict[str, MemoAnswer] = {}
    for key, ans in answers.items():
        text_marks: list[int] = []
        lone_marks: list[int] = []
        for raw in ans.raw_rows:
            cleaned, marks = clean_memo_row(raw, maths_style)
            if cleaned:
                ans.rows.append(cleaned)
                if marks is not None:
                    text_marks.append(marks)
            elif marks is not None:
                lone_marks.append(marks)
        ans.marks = sum(text_marks) if text_marks else (lone_marks[0] if lone_marks else None)
        result[key_str(key)] = ans
    return result


def looks_like_memo(first_pages_text: str) -> bool:
    t = (first_pages_text or "").upper()
    return any(w in t for w in ("MARKING GUIDELINE", "MEMORANDUM", "NASIENRIGLYN", "MARKING GUIDELINES"))
