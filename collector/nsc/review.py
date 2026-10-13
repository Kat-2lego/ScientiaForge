"""`python collector.py --review out/FILE.json`: a compact, human-checkable report.

Shows what students would see (question + memo answer) for every question that
is used for Active Recall, and why the others were left out.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


def _short(text, n: int = 96) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def review_json(path: Path, limit: int = 30, show_all: bool = False) -> str:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    paper = data.get("paper") or {}
    questions = data.get("questions") or []
    used = [q for q in questions if q.get("is_recall_suitable")]
    left_out = [q for q in questions if not q.get("is_recall_suitable")]
    auto = [q for q in used if q.get("is_auto_markable")]

    title = f"{paper.get('subject', '?')} Paper {paper.get('paper_number', '?')}, {paper.get('exam_session', '')} {paper.get('year', '')}"
    out = [
        f"=== {title} ===",
        f"status: {paper.get('processing_status', '?')}   total marks: {paper.get('total_marks')}   pages: {paper.get('page_count')}",
        f"{len(questions)} questions found: {len(used)} used for Active Recall ({len(auto)} marked for the student, "
        f"{len(used) - len(auto)} self-marked), {len(left_out)} left out",
    ]
    if paper.get("processing_notes"):
        out.append(f"notes: {_short(paper['processing_notes'], 200)}")

    reasons = Counter()
    for q in left_out:
        for r in q.get("_reasons") or ["(no reason recorded)"]:
            reasons[re.sub(r"\(.*\)", "(…)", r)] += 1
    if reasons:
        out.append("\nwhy questions were left out:")
        out.extend(f"  {n:3d}  {r}" for r, n in reasons.most_common(8))

    out.append(f"\n--- what students get (first {min(limit, len(used))} of {len(used)}) ---")
    out.append("format:  number [type, marks, marking]  Q: question   =>   MEMO: accepted answer")
    for q in used[:limit]:
        memo = q.get("memo") or {}
        marking = "auto" if q.get("is_auto_markable") else "self"
        answer = memo.get("accepted_answer") or memo.get("answer_text")
        alts = memo.get("accepted_alternatives") or []
        opts = q.get("options") or []
        opt_txt = f"  ({len(opts)} options)" if opts else ""
        out.append(
            f"{q['question_number']:<8}[{q.get('question_type')}, {q.get('marks')}m, {marking}]  "
            f"Q: {_short(q.get('question_text'))}{opt_txt}   =>   MEMO: {_short(answer, 70)}"
            + (f"  (also: {_short(', '.join(alts), 40)})" if alts else "")
        )
        if q.get("context_text"):
            out.append(f"{'':<8}   context: {_short(q['context_text'], 100)}")

    if left_out:
        shown = left_out if show_all else left_out[:8]
        out.append(f"\n--- questions left out ({'all' if show_all else 'first 8'} of {len(left_out)}) ---")
        for q in shown:
            out.append(f"{q['question_number']:<8}Q: {_short(q.get('question_text'), 70)}   because: {_short('; '.join(q.get('_reasons') or []), 60)}")
    return "\n".join(out)


def _paper_note(paper: dict, questions: list) -> str:
    notes = (paper.get("processing_notes") or "").lower()
    if paper.get("processing_status") == "ready":
        return ""
    if "almost no text" in notes or "looks like a scan" in notes:
        return "scanned PDF (no text)"
    if "memo not usable" in notes or "no memo" in notes:
        return "no usable memo"
    if not questions:
        return "no questions found"
    return "too few usable questions"


def summarise_dir(out_dir: Path) -> str:
    """One row per parsed paper in out/, so you can decide what is worth uploading."""
    rows = []
    for path in sorted(Path(out_dir).glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        paper, questions = data.get("paper") or {}, data.get("questions") or []
        used = [q for q in questions if q.get("is_recall_suitable")]
        auto = sum(1 for q in used if q.get("is_auto_markable"))
        rows.append((
            f"{paper.get('subject', path.stem)} P{paper.get('paper_number', '?')}",
            f"{paper.get('exam_session', '')} {paper.get('year', '')}".strip(),
            paper.get("processing_status", "?"), len(questions), len(used), auto, len(used) - auto,
            _paper_note(paper, questions), path.name,
        ))
    if not rows:
        return f"No parsed papers found in {out_dir}. Run the collector with --no-upload first."
    head = f"{'paper':<44}{'exam':<15}{'status':<9}{'found':>6}{'usable':>8}{'auto':>6}{'self':>6}   note"
    lines = [head, "-" * len(head)]
    for name, exam, status, found, usable, auto, self_, note, _ in rows:
        flag = "" if usable >= 8 else "  <- few"
        lines.append(f"{name[:43]:<44}{exam:<15}{status:<9}{found:>6}{usable:>8}{auto:>6}{self_:>6}   {note}{flag}")
    good = [r for r in rows if r[4] >= 8]
    lines.append("-" * len(head))
    lines.append(f"{len(rows)} papers parsed; {len(good)} with 8+ usable questions ({sum(r[4] for r in good)} questions in total)")
    return "\n".join(lines)
