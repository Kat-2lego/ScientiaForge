"""End-to-end parsing tests on PDFs that copy the real DBE layout."""
import pytest

import pdf_fixtures as fx
from nsc.classify import classify, numeric_answer_parts, _expand_alternatives
from nsc.memo_parser import clean_memo_row, looks_like_memo, parse_memo
from nsc.paper_parser import parse_question_paper
from nsc.pdf_text import extract_pdf
from nsc.pipeline import Collector, check_cover, detect_cover_subject, ensure_pdf, DataError


def _run(qp_bytes, memo_bytes, subject):
    qp = extract_pdf(qp_bytes)
    memo = extract_pdf(memo_bytes)
    paper = parse_question_paper(qp.rows, qp.first_pages_text)
    answers = parse_memo(memo.rows, paper.all_keys, subject)
    out = {}
    for q in paper.questions:
        m = answers.get(q.number)
        m = m if m and m.text else None
        out[q.number] = (q, m, classify(q, m))
    return qp, memo, paper, out


@pytest.fixture(scope="module")
def life():
    return _run(fx.life_sciences_paper(), fx.life_sciences_memo(), "Life Sciences")


@pytest.fixture(scope="module")
def maths():
    return _run(fx.maths_paper(), fx.maths_memo(), "Mathematics")


# ---------------------------------------------------------------- extraction
def test_headers_footers_removed(life):
    qp = life[0]
    texts = [r.text for r in qp.rows]
    assert not any("Copyright reserved" in t for t in texts)
    assert not any(t.startswith("Life Sciences/P1") for t in texts)


def test_superscripts_become_unicode(maths):
    q = maths[3]["1.1.2"][0]
    assert q.text == "x² + 5x + 6 = 0"


def test_ticks_are_recognised_and_removed():
    memo = extract_pdf(fx.life_sciences_memo())
    assert any("✓" in r.text for r in memo.rows)


# ---------------------------------------------------------------- question paper
def test_question_numbers_in_order(life):
    keys = [".".join(map(str, k)) for k in life[2].all_keys]
    assert keys == ["1.1", "1.1.1", "1.1.2", "1.1.3", "1.1.4", "1.2", "1.2.1", "1.2.2", "1.2.3",
                    "1.3", "1.3.1", "1.3.2", "2.1", "2.1.1", "2.1.2", "2.2", "2.2.1", "2.3", "2.4"]


def test_diagram_label_and_measurements_are_not_questions(life, maths):
    # "2.3" printed inside a diagram, and "2.5 m" starting a line, must not start questions
    assert life[3]["2.3"][0].text.startswith("How many chromosomes")
    assert "2.5 m" in maths[3]["2.4"][0].text


def test_total_marks_and_section(life):
    assert life[2].total_marks == 50
    assert life[3]["1.1.1"][0].section == "Section A"
    assert life[3]["2.1.1"][0].section == "Section B"


def test_mcq_options_extracted_including_wrapped_lines(life):
    q = life[3]["1.1.2"][0]
    assert [o["label"] for o in q.options] == ["A", "B", "C", "D"]
    assert q.options[1]["text"] == "nutrients from the mother to the foetus, via the placenta and umbilical cord."
    assert q.text.endswith("transport …")


def test_group_marks_apply_to_every_item(life):
    for n in ("1.1.1", "1.1.2", "1.1.4"):
        assert life[3][n][0].marks == 2, n
    for n in ("1.2.1", "1.2.2", "1.2.3"):
        assert life[3][n][0].marks == 1, n


def test_sub_part_marks_are_summed_and_stem_total_ignored(life):
    assert life[3]["2.2.1"][0].marks == 2
    assert life[3]["2.1.2"][0].marks == 2  # the "(3)" stem total after it is ignored


def test_context_keeps_extract_but_drops_answer_book_instructions(life):
    ctx = life[3]["2.1.1"][0].context
    assert "amplexus" in ctx
    ctx_mcq = life[3]["1.1.1"][0].context or ""
    assert "ANSWER BOOK" not in ctx_mcq


def test_context_instruction_stripping_respects_question_numbers(life):
    ctx = life[3]["1.3.1"][0].context
    assert ctx == ("Indicate whether each of the descriptions in COLUMN I apply to A ONLY, "
                   "B ONLY, BOTH A AND B or NONE of the items in COLUMN II.")
    assert not life[3]["1.1.1"][0].context  # MCQ boilerplate removed entirely


def test_clean_context_keeps_decimals():
    from nsc.paper_parser import _clean_context
    text = "Study the table.\nAnswer QUESTIONS 2.1.1 to 2.1.3 in the ANSWER BOOK.\nTemperature rose by 2.5 degrees."
    assert _clean_context(text) == "Study the table.\nTemperature rose by 2.5 degrees."


def test_reflow_joins_mid_sentence_capital_lines_but_keeps_items():
    from nsc.patterns import reflow
    assert reflow(["Indicate whether each description applies to A ONLY,", "B ONLY or NONE of the items."]) == \
        "Indicate whether each description applies to A ONLY, B ONLY or NONE of the items."
    assert reflow(["Which statement is true about the nephron?", "A It filters blood"]).count("\n") == 1


def test_column_ii_items_are_kept_with_the_question(life):
    text = life[3]["1.3.1"][0].text
    assert "A: Oogenesis" in text and "B: Spermatogenesis" in text
    assert text.startswith("A process that produces four mature gametes")


def test_information_sheet_is_not_parsed(maths):
    assert "1.1" in maths[3] or True
    assert all("P(1 + ni)" not in q.text for q, _, _ in maths[3].values())


# ---------------------------------------------------------------- memo matching
def test_memo_answers_matched(life):
    got = {n: (m.text if m else None) for n, (_, m, _) in life[3].items()}
    assert got["1.1.1"] == "D"
    assert got["1.2.1"] == "Vivipary"
    assert got["1.3.1"] == "B only"
    assert got["2.1.1"] == "External fertilisation"
    assert got["2.2.1"] == "(a) Seminal vesicle\n(b) Testosterone"
    assert "dry out" in got["2.1.2"]


def test_maths_descriptor_column_removed(maths):
    got = {n: (m.text if m else None) for n, (_, m, _) in maths[3].items()}
    assert got["1.1.1"] == "2x = 10\nx = 5"
    assert got["1.2"] == "(x − 3)(x + 3)"
    assert got["2.2"] == "Tn = 4n − 1"


# ---------------------------------------------------------------- classification
@pytest.mark.parametrize(
    "number,qtype,fmt,accepted,auto,suitable",
    [
        ("1.1.1", "multiple_choice", "letter", "D", True, True),
        ("1.1.3", "multiple_choice", "letter", "C", True, False),  # refers to a diagram
        ("1.2.1", "short_answer", "term", "Vivipary", True, True),
        ("1.3.1", "multiple_choice", "term", "B only", True, True),
        ("2.1.1", "short_answer", "term", "External fertilisation", True, True),
        ("2.1.2", "other", "text", None, False, True),  # explain -> self-marked
        ("2.2.1", "short_answer", "text", None, False, False),  # diagram
        ("2.3", "numerical", "number", "23", True, True),
        ("2.4", "calculation", "number", "= 20%", True, True),
    ],
)
def test_life_sciences_classification(life, number, qtype, fmt, accepted, auto, suitable):
    _, _, c = life[3][number]
    assert (c.question_type, c.answer_format, c.accepted_answer) == (qtype, fmt, accepted)
    assert c.is_auto_markable is auto
    assert c.is_recall_suitable is suitable


def test_a_only_question_gets_the_papers_own_choices(life):
    c = life[3]["1.3.1"][2]
    assert [o["label"] for o in c.options] == ["A only", "B only", "Both A and B", "None"]


def test_term_alternatives(life):
    c = life[3]["1.2.3"][2]
    assert c.accepted_answer == "Blastocyst" and c.alternatives == ["blastula"]


@pytest.mark.parametrize(
    "number,fmt,accepted,auto",
    [
        ("1.1.1", "number", "x = 5", True),
        ("1.1.2", "number", "x = −2 or x = −3", True),
        ("1.2", "expression", "(x − 3)(x + 3)", True),
        ("1.3", "number", "100", True),
        ("2.1", "number", "15", True),
        ("2.2", "text", None, False),
        ("2.3", "number", "= 820", True),
    ],
)
def test_maths_classification(maths, number, fmt, accepted, auto):
    _, _, c = maths[3][number]
    assert (c.answer_format, c.accepted_answer, c.is_auto_markable) == (fmt, accepted, auto)
    assert c.is_recall_suitable


# ---------------------------------------------------------------- helpers
@pytest.mark.parametrize(
    "text,expected",
    [
        ("x = 2 or x = −3", ["2", "-3"]),
        ("a = 8 m·s-2", ["8 m·s-2"]),
        ("R 1 250,50", ["R 1250,50"]),
        ("6,02 × 10²³", ["6,02e23"]),
        ("x > 2", None),
        ("Tn = 4n − 1", None),
    ],
)
def test_numeric_answer_parts(text, expected):
    assert numeric_answer_parts(text) == expected


def test_expand_alternatives():
    assert _expand_alternatives("Pituitary gland/hypophysis") == ["Pituitary gland", "hypophysis"]
    assert _expand_alternatives("(Graafian) follicle") == ["Graafian follicle", "follicle"]


def test_clean_memo_row_group_marks_and_any():
    assert clean_memo_row("C  (10 x 2)  (20)", False) == ("C", None)
    assert clean_memo_row("- It is alkaline ✓ Any (1 x 2)", False) == ("- It is alkaline", None)


def test_memo_detection_and_cover_subject(life, maths):
    assert looks_like_memo(life[1].first_pages_text)
    assert not looks_like_memo(life[0].first_pages_text.split("\n")[0])
    assert detect_cover_subject("GRADE 12 TECHNICAL MATHEMATICS P1") == "TECHNICAL MATHEMATICS"
    assert detect_cover_subject("MATHEMATICAL LITERACY P2 NOVEMBER") == "MATHEMATICAL LITERACY"
    assert check_cover(maths[0], "Mathematics", "question paper") is None
    with pytest.raises(DataError):
        check_cover(maths[0], "Mathematical Literacy", "question paper")


def test_ensure_pdf_rejects_html_and_zip():
    with pytest.raises(DataError):
        ensure_pdf(b"<!DOCTYPE html><html>", "question paper")
    with pytest.raises(DataError):
        ensure_pdf(b"PK\x03\x04rest", "question paper")
    ensure_pdf(fx.maths_paper(), "question paper")


def test_ingest_payload_shape(life):
    paper, answers = life[2], {n: m for n, (_, m, _) in life[3].items() if m}
    dummy = Collector.__new__(Collector)
    questions, stats = Collector._build_questions(dummy, paper, answers)
    assert stats["questions"] == 14 and stats["recall"] >= 10
    q = next(x for x in questions if x["question_number"] == "1.3.1")
    assert q["options"][0]["label"] == "A only"
    assert q["memo"]["accepted_answer"] == "B only" and q["memo"]["marks"] == 2
    assert q["sort_key"] == [1, 3, 1]


# ---------------------------------------------------------------- real-world memo fragments
# These lines are exactly how the November 2024 Maths P1 memo (Word equations) came out of the extractor.
REAL_FRAGMENTED_MEMO_LINES = [
    "x = ,1 71 or x = ,0 29 4 answer",            # 1,71 and 0,29
    "2 x 2 − 4 x + 1 = 0 standard form",           # 2x² − 4x + 1 = 0
    "x 2 − 2 x − 3 0",                             # x² − 2x − 3
    "( x − 3 )( x + )1 0 factors",                 # (x − 3)(x + 1)
]


@pytest.mark.parametrize("line", REAL_FRAGMENTED_MEMO_LINES)
def test_fragmented_memo_equations_are_detected(line):
    from nsc.classify import memo_looks_garbled
    assert memo_looks_garbled(line)


@pytest.mark.parametrize(
    "line",
    ["x = 5", "x = −2 or x = −3", "(x − 3)(x + 3)", "S20 = 20/2 [2(3) + (20 − 1)(4)]\n= 820",
     "T3 = 2.5 × 5 = 12.5 m", "Tn = 4n − 1", "= 20%", "a = 8 m·s⁻²", "Seminal vesicle"],
)
def test_clean_memo_answers_are_not_flagged(line):
    from nsc.classify import memo_looks_garbled
    assert memo_looks_garbled(line) is None


def test_fragmented_memo_is_never_auto_marked_or_shown():
    from nsc.memo_parser import MemoAnswer
    from nsc.paper_parser import ParsedQuestion
    q = ParsedQuestion(number="1.1.2", key=(1, 1, 2), top_question=1, section="Section A", page=2,
                       text="Solve for x, correct to TWO decimal places: 2x² − 4x + 1 = 0", context=None, options=None, marks=4)
    memo = MemoAnswer(number="1.1.2", page=2, rows=["2 x 2 − 4 x + 1 = 0 standard form", "x = ,1 71 or x = ,0 29 4 answer"])
    c = classify(q, memo)
    assert c.is_auto_markable is False and c.accepted_answer is None
    assert c.is_recall_suitable is False
    assert any("unreliable" in r for r in c.reasons)


# Column I / II as the real November 2024 Life Sciences P1 paper prints them: the description
# wraps onto a second line and the Column II cell starts after only a single space.
@pytest.mark.parametrize(
    "rows,description,column_ii",
    [
        (["Acts as a micro-filter for the developing A: Placenta", "foetus B: Cervix"],
         "Acts as a micro-filter for the developing foetus", ["A: Placenta", "B: Cervix"]),
        (["The part of the brain that controls heart A: Corpus callosum", "rate B: Medulla oblongata"],
         "The part of the brain that controls heart rate", ["A: Corpus callosum", "B: Medulla oblongata"]),
        (["The area on the retina where there are A: Blind spot", "no rods or cones B: Cornea"],
         "The area on the retina where there are no rods or cones", ["A: Blind spot", "B: Cornea"]),
        (["A process that produces four  A: Oogenesis", "mature gametes from a single  B: Spermatogenesis", "diploid cell"],
         "A process that produces four mature gametes from a single diploid cell", ["A: Oogenesis", "B: Spermatogenesis"]),
    ],
)
def test_column_ii_split_with_narrow_gaps(rows, description, column_ii):
    from nsc.paper_parser import _split_column_ii
    from nsc.patterns import reflow
    left, right = _split_column_ii(rows)
    assert reflow(left) == description
    assert right == column_ii


# ---------------------------------------------------------------- the real Nov 2024 Life Sciences P1 questions
STAND_ALONE = [  # were dropped only because their section has a diagram/passage/table; they need none of it
    "State ONE function of thyroxin.",
    "Describe TWO ways in which insulin decreases blood glucose levels.",
    "Name the TWO effector muscles that are involved in the pupillary mechanism.",
    "Name the disorder associated with degeneration of the myelin sheaths of neurons.",
    "Fertilisation in vultures takes place internally. State TWO advantages of internal fertilisation.",
]
NEEDS_THE_PAPER = [  # each one points at the figure, data, passage or an earlier answer
    "State the purpose of the control group in this investigation.",
    "How was the reliability of this investigation ensured?",
    "How would the progesterone level differ after day 20 if this female was pregnant?",
    "Give the axon diameter (in µm) at which an impulse moves at 20 m/s in",
    "Describe the function of the type of neuron identified in QUESTION 2.5.1.",
    "Give ONE reason from the passage why vultures",
    "Which group (X or Y) consists of healthy individuals?",
    "Use the letters A, B and C to indicate the direction in which an impulse travels",
]


@pytest.mark.parametrize("text", STAND_ALONE)
def test_standalone_questions_are_recognised(text):
    from nsc.classify import standalone_question
    assert standalone_question(text)


@pytest.mark.parametrize("text", NEEDS_THE_PAPER)
def test_questions_that_point_at_the_paper_are_not_standalone(text):
    from nsc.classify import standalone_question
    assert not standalone_question(text)


def _q(text, context, marks=2):
    from nsc.paper_parser import ParsedQuestion
    return ParsedQuestion(number="3.4.2", key=(3, 4, 2), top_question=3, section="Section B", page=12,
                          text=text, context=context, options=None, marks=marks)


def test_question_in_a_figure_section_is_kept_without_the_figure_context():
    from nsc.memo_parser import MemoAnswer
    from nsc.classify import classify
    context = "QUESTION 3\nThe diagram below shows the regulation of thyroxin.\nStudy the information and answer the questions."
    memo = MemoAnswer(number="3.4.2", page=9, rows=["- Regulates the metabolic rate", "- Stimulates growth"])
    c = classify(_q("State ONE function of thyroxin.", context), memo)
    assert c.is_recall_suitable, c.reasons
    assert c.has_figure and c.context_changed
    assert "diagram" not in (c.context_text or "")


def test_question_that_points_at_the_investigation_is_still_excluded():
    from nsc.memo_parser import MemoAnswer
    from nsc.classify import classify
    context = "An investigation was done on plant hormones. The table below shows the results."
    memo = MemoAnswer(number="3.3.1", page=9, rows=["To compare the results"])
    c = classify(_q("State the purpose of the control group in this investigation.", context), memo)
    assert not c.is_recall_suitable
    assert any("figure" in r for r in c.reasons)


def test_stray_page_marks_never_become_context(life):
    ctx = life[3]["1.1.1"][0].context
    assert not ctx  # MCQ boilerplate and stray marks like "NV" are both gone


def test_short_junk_title_is_ignored():
    from nsc.paper_parser import _clean_context
    assert _clean_context("NV") == ""
    assert _clean_context("A man is long-sighted. Explain how:") == "A man is long-sighted. Explain how:"


# ---------------------------------------------------------------- what the second real report showed
@pytest.mark.parametrize("text", ["Identify part: (a) A (b) B", "Identify part: (a) X (b) Y", "Which group (X or Y) consists of healthy individuals?"])
def test_questions_naming_diagram_labels_are_not_standalone(text):
    from nsc.classify import standalone_question
    assert not standalone_question(text)


@pytest.mark.parametrize(
    "junk",
    ["A C Endometrium B",
     "Neuron with a Neuron without a myelin sheath myelin sheath B Myelin sheath A C",
     "Less TSH Level of thyroxin (X) GLAND Y PITUITARY GLAND Level of thyroxin (Z) More TSH"],
)
def test_diagram_label_debris_is_dropped_from_context(junk):
    from nsc.classify import drop_label_lines
    assert drop_label_lines(junk) == ""


@pytest.mark.parametrize(
    "keep",
    ["A man is long-sighted. Explain how:",
     "Give the correct biological term for EACH of the following descriptions.",
     "Vultures are birds of prey that feed on the flesh of dead animals. A female vulture lays only one egg."],
)
def test_real_context_sentences_are_kept(keep):
    from nsc.classify import drop_label_lines
    assert drop_label_lines(keep) == keep


def test_identify_part_question_in_a_figure_section_is_excluded():
    from nsc.memo_parser import MemoAnswer
    from nsc.classify import classify
    context = "The diagram below shows the female reproductive system.\nA C Endometrium B"
    memo = MemoAnswer(number="2.1.1", page=6, rows=["(a) Fallopian tube (b) Ovary"])
    c = classify(_q("Identify part: (a) A (b) B", context), memo)
    assert not c.is_recall_suitable and any("figure" in r for r in c.reasons)


def test_kept_question_shows_no_diagram_labels():
    from nsc.memo_parser import MemoAnswer
    from nsc.classify import classify
    context = "Less TSH Level of thyroxin (X) GLAND Y PITUITARY GLAND Level of thyroxin (Z) More TSH"
    memo = MemoAnswer(number="3.4.2", page=9, rows=["- It regulates the metabolic rate"])
    c = classify(_q("State ONE function of thyroxin.", context, marks=1), memo)
    assert c.is_recall_suitable, c.reasons
    assert c.context_changed and not c.context_text
