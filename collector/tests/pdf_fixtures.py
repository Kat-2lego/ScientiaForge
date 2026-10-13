"""Build small PDFs that copy the layout of real DBE papers and memos.

Layout (A4, points) taken from the 2023 NSC papers:
  x=56  level-1 numbers ("1.1")        x=85  level-2 numbers / stem text
  x=127 question text / option letters x=155 option text
  x=520 marks "(2)"                    running header + "Copyright reserved" footer
Ticks are drawn with the ZapfDingbats check glyph, like the Wingdings ticks
in the official memos.
"""
from __future__ import annotations

import pymupdf

W, H = 595, 842
FONT_FILE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
try:
    _FONT = pymupdf.Font(fontfile=FONT_FILE)
    FONT_KW = {"fontname": "dejavu", "fontfile": FONT_FILE}
except Exception:  # fall back to Helvetica (Latin-1 only)
    _FONT = pymupdf.Font("helv")
    FONT_KW = {"fontname": "helv"}
N1, N2, TXT, OPT, OPT_TXT, MARKS = 56, 85, 127, 127, 155, 520


class Doc:
    def __init__(self, header_left: str, header_right: str, header2: str = "NSC"):
        self.doc = pymupdf.open()
        self.header_left = header_left
        self.header_right = header_right
        self.header2 = header2
        self.page = None
        self.y = 0.0

    def new_page(self, cover: bool = False):
        self.page = self.doc.new_page(width=W, height=H)
        n = self.doc.page_count
        if not cover:
            self.text(56, 40, self.header_left, 9)
            self.text(290, 40, str(n), 9)
            self.text(440, 40, self.header_right, 9)
            self.text(270, 52, self.header2, 9)
        self.text(56, 815, "Copyright reserved", 9)
        if n < 99:
            self.text(470, 815, "Please turn over", 9)
        self.y = 110
        return self

    def text(self, x, y, s, size=11):
        self.page.insert_text((x, y), s, fontsize=size, **FONT_KW)

    def tick(self, x, y, count=1):
        # "4" in ZapfDingbats is a check mark
        self.page.insert_text((x, y), "4" * count, fontsize=11, fontname="zadb")

    def row(self, cells, marks=None, gap=16, ticks=None):
        """cells: [(x, text), ...]; ticks: [(x, count)]"""
        for x, s in cells:
            self.text(x, self.y, s)
        for x, count in ticks or []:
            self.tick(x, self.y, count)
        if marks:
            self.text(MARKS, self.y, marks)
        self.y += gap
        return self

    def sup(self, x, base, sup_text, after=None, after_x=None):
        """Write base text with a raised, smaller superscript (x²)."""
        self.text(x, self.y, base)
        bx = x + _FONT.text_length(base, fontsize=11)
        self.page.insert_text((bx + 0.5, self.y - 4.5), sup_text, fontsize=7, **FONT_KW)
        if after:
            ax = after_x if after_x is not None else bx + 6
            self.text(ax, self.y, after)

    def skip(self, amount=10):
        self.y += amount
        return self

    def bytes(self) -> bytes:
        return self.doc.tobytes()


# --------------------------------------------------------------------------- #
def life_sciences_paper() -> bytes:
    d = Doc("Life Sciences/P1", "DBE/November 2023")
    d.new_page(cover=True)
    for y, s in [(200, "NATIONAL"), (220, "SENIOR CERTIFICATE"), (250, "GRADE 12"), (300, "LIFE SCIENCES P1"),
                 (330, "NOVEMBER 2023"), (420, "MARKS: 50"), (440, "TIME: 2½ hours"),
                 (500, "This question paper consists of 6 pages.")]:
        d.text(200, y, s, size=14)

    d.new_page()
    d.row([(56, "INSTRUCTIONS AND INFORMATION")])
    d.row([(56, "Read the following instructions carefully before answering the questions.")])
    for i, s in enumerate(["Answer ALL the questions.", "Write ALL the answers in the ANSWER BOOK.",
                           "Number the answers correctly according to the numbering system."], start=1):
        d.row([(56, f"{i}."), (85, s)])

    d.new_page()
    d.row([(56, "SECTION A")]).row([(56, "QUESTION 1")]).skip()
    d.row([(N1, "1.1"), (N2, "Various options are provided as possible answers to the following questions.")])
    d.row([(N2, "Choose the answer and write only the letter (A–D) next to the question")])
    d.row([(N2, "numbers (1.1.1 to 1.1.4) in the ANSWER BOOK, e.g. 1.1.5 D.")]).skip()
    d.row([(N2, "1.1.1"), (TXT, "Which ONE of the following parts controls the amount of light")])
    d.row([(TXT, "entering the eye by influencing the size of the pupil?")]).skip(4)
    for letter, s in zip("ABCD", ["Sclera", "Cornea", "Retina", "Iris"]):
        d.row([(OPT, letter), (OPT_TXT, s)])
    d.skip()
    d.row([(N2, "1.1.2"), (TXT, "The function of the umbilical vein is to transport …")]).skip(4)
    d.row([(OPT, "A"), (OPT_TXT, "carbon dioxide from the foetus to the mother.")])
    d.row([(OPT, "B"), (OPT_TXT, "nutrients from the mother to the foetus, via the")])
    d.row([(OPT_TXT, "placenta and umbilical cord.")])
    d.row([(OPT, "C"), (OPT_TXT, "carbon dioxide from the mother to the foetus.")])
    d.row([(OPT, "D"), (OPT_TXT, "nutrients from the foetus to the mother.")])
    d.skip()
    d.row([(N2, "1.1.3"), (TXT, "The diagram below represents part of the human ear.")])
    d.row([(380, "A"), (450, "B")])  # diagram labels
    d.row([(TXT, "Which ONE of the following is the part labelled B?")]).skip(4)
    for letter, s in zip("ABCD", ["Cochlea", "Pinna", "Ossicles", "Eustachian tube"]):
        d.row([(OPT, letter), (OPT_TXT, s)])
    d.skip()
    d.row([(N2, "1.1.4"), (TXT, "In a person suffering from long-sightedness, …")]).skip(4)
    d.row([(OPT, "A"), (OPT_TXT, "the eyeball is longer than normal.")])
    d.row([(OPT, "B"), (OPT_TXT, "distant objects appear blurred.")])
    d.row([(OPT, "C"), (OPT_TXT, "light rays fall behind the retina.")])
    d.row([(OPT, "D"), (OPT_TXT, "light rays are refracted more by the lens."), (430, "(4 x 2)")], marks="(8)")

    d.new_page()
    d.row([(N1, "1.2"), (N2, "Give the correct biological term for each of the following descriptions.")])
    d.row([(N2, "Write only the term next to the question numbers (1.2.1 to 1.2.3) in the")])
    d.row([(N2, "ANSWER BOOK.")]).skip()
    d.row([(N2, "1.2.1"), (TXT, "A reproductive strategy where the young receives nutrients through")])
    d.row([(TXT, "the placenta")])
    d.row([(N2, "1.2.2"), (TXT, "The duct that transports semen and urine to the outside of the body")])
    d.row([(N2, "1.2.3"), (TXT, "The hollow ball of cells formed after the morula stage"), (430, "(3 x 1)")], marks="(3)")
    d.skip()
    d.row([(N1, "1.3"), (N2, "Indicate whether each of the descriptions in COLUMN I apply to A ONLY,")])
    d.row([(N2, "B ONLY, BOTH A AND B or NONE of the items in COLUMN II. Write A only,")])
    d.row([(N2, "B only, both A and B or none next to the question numbers (1.3.1 to 1.3.2)")])
    d.row([(N2, "in the ANSWER BOOK.")]).skip()
    d.row([(TXT, "COLUMN I"), (360, "COLUMN II")])
    d.row([(N2, "1.3.1"), (TXT, "A process that produces four"), (360, "A: Oogenesis")])
    d.row([(TXT, "mature gametes from a single"), (360, "B: Spermatogenesis")])
    d.row([(TXT, "diploid cell")]).skip(4)
    d.row([(N2, "1.3.2"), (TXT, "A defence mechanism that"), (360, "A: Thorns")])
    d.row([(TXT, "protects plants against herbivores"), (360, "B: Chemicals")])
    d.row([(430, "(2 x 2)")], marks="(4)")
    d.skip(20)
    d.row([(300, "TOTAL SECTION A:"), (480, "15")])

    d.new_page()
    d.row([(56, "SECTION B")]).row([(56, "QUESTION 2")]).skip()
    d.row([(N1, "2.1"), (N2, "Read the extract below.")]).skip(4)
    d.row([(N2, "In some frog species, during mating, the male climbs onto the back of the")])
    d.row([(N2, "female. The female releases about 6 000 ova, while the male releases sperm")])
    d.row([(N2, "onto them. This mating behaviour is called amplexus.")]).skip()
    d.row([(N2, "2.1.1"), (TXT, "Name the type of fertilisation that occurs during reproduction in")])
    d.row([(TXT, "frogs.")], marks="(1)")
    d.row([(N2, "2.1.2"), (TXT, "Explain why the fertilised eggs of these frogs do not survive on")])
    d.row([(TXT, "land.")], marks="(2)")
    d.row([(MARKS, "(3)")]).skip()
    d.row([(N1, "2.2"), (N2, "The diagram below represents the male reproductive system.")])
    d.row([(330, "2.3"), (400, "B")])  # a label inside the diagram that looks like a number
    d.row([(N2, "2.2.1"), (TXT, "Name:")])
    d.row([(TXT, "(a)"), (160, "Part A")], marks="(1)")
    d.row([(TXT, "(b)"), (160, "The hormone secreted by B")], marks="(1)")
    d.row([(MARKS, "(2)")]).skip()
    d.row([(N1, "2.3"), (N2, "How many chromosomes are found in a human sperm cell?")], marks="(1)")
    d.skip()
    d.row([(N1, "2.4"), (N2, "A learner's pulse rate increased from 70 to 84 beats per minute after")])
    d.row([(N2, "exercise. Calculate the percentage increase in the pulse rate.")], marks="(3)")
    d.row([(MARKS, "[20]")])
    d.skip(20)
    d.row([(300, "TOTAL SECTION B:"), (480, "35")])
    d.row([(300, "GRAND TOTAL:"), (480, "50")])
    return d.bytes()


def life_sciences_memo() -> bytes:
    d = Doc("Life Sciences/P1", "DBE/November 2023", "NSC – Marking Guidelines")
    d.new_page(cover=True)
    for y, s in [(200, "NATIONAL"), (220, "SENIOR CERTIFICATE"), (250, "GRADE 12"), (300, "LIFE SCIENCES P1"),
                 (330, "NOVEMBER 2023"), (360, "MARKING GUIDELINES"), (420, "MARKS: 50")]:
        d.text(200, y, s, size=14)

    d.new_page()
    d.row([(56, "PRINCIPLES RELATED TO MARKING LIFE SCIENCES")])
    d.row([(56, "1."), (85, "If more information than marks allocated is given")])
    d.row([(85, "Stop marking when maximum marks is reached.")])
    d.row([(56, "10."), (85, "Wrong numbering")])

    d.new_page()
    d.row([(56, "SECTION A")]).row([(56, "QUESTION 1")]).skip()
    d.row([(N1, "1.1"), (N2, "1.1.1"), (150, "D")], ticks=[(170, 2)])
    d.row([(N2, "1.1.2"), (150, "B")], ticks=[(170, 2)])
    d.row([(N2, "1.1.3"), (150, "C")], ticks=[(170, 2)])
    d.row([(N2, "1.1.4"), (150, "C"), (420, "(4 x 2)")], marks="(8)", ticks=[(170, 2)]).skip()
    d.row([(N1, "1.2"), (N2, "1.2.1"), (150, "Vivipary")], ticks=[(210, 1)])
    d.row([(N2, "1.2.2"), (150, "Urethra")], ticks=[(210, 1)])
    d.row([(N2, "1.2.3"), (150, "Blastocyst/blastula"), (420, "(3 x 1)")], marks="(3)", ticks=[(260, 1)]).skip()
    d.row([(N1, "1.3"), (N2, "1.3.1"), (150, "B only")], ticks=[(210, 2)])
    d.row([(N2, "1.3.2"), (150, "Both A and B"), (420, "(2 x 2)")], marks="(4)", ticks=[(240, 2)])
    d.row([(300, "TOTAL SECTION A:"), (480, "15")])

    d.new_page()
    d.row([(56, "SECTION B")]).row([(56, "QUESTION 2")]).skip()
    d.row([(N1, "2.1"), (N2, "2.1.1"), (150, "External fertilisation")], marks="(1)", ticks=[(280, 1)])
    d.row([(N2, "2.1.2"), (150, "- The eggs will dry out")], ticks=[(290, 1)])
    d.row([(150, "- because they have no shells/are not amniotic eggs")], marks="(2)", ticks=[(420, 1)])
    d.row([(MARKS, "(3)")])
    d.row([(N1, "2.2"), (N2, "2.2.1"), (150, "(a)"), (180, "Seminal vesicle")], marks="(1)", ticks=[(290, 1)])
    d.row([(150, "(b)"), (180, "Testosterone")], marks="(1)", ticks=[(290, 1)])
    d.row([(N1, "2.3"), (N2, "23")], marks="(1)", ticks=[(120, 1)])
    d.row([(N1, "2.4"), (N2, "(84 – 70) ÷ 70 × 100")], ticks=[(260, 1)])
    d.row([(N2, "= 20%")], marks="(3)", ticks=[(160, 2)])
    d.row([(MARKS, "[20]")])
    d.row([(300, "TOTAL SECTION B:"), (480, "35")])
    d.row([(300, "GRAND TOTAL:"), (480, "50")])
    return d.bytes()


# --------------------------------------------------------------------------- #
def maths_paper() -> bytes:
    d = Doc("Mathematics/P1", "DBE/November 2024")
    d.new_page(cover=True)
    for y, s in [(200, "NATIONAL"), (220, "SENIOR CERTIFICATE"), (250, "GRADE 12"), (300, "MATHEMATICS P1"),
                 (330, "NOVEMBER 2024"), (420, "MARKS: 30"), (440, "TIME: 3 hours")]:
        d.text(200, y, s, size=14)

    d.new_page()
    d.row([(56, "INSTRUCTIONS AND INFORMATION")])
    d.row([(56, "1."), (85, "This question paper consists of 2 questions.")])
    d.row([(56, "2."), (85, "Answers only will NOT necessarily be awarded full marks.")])

    d.new_page()
    d.row([(56, "QUESTION 1")]).skip()
    d.row([(N1, "1.1"), (N2, "Solve for x:")])
    d.row([(N2, "1.1.1"), (TXT, "2x + 5 = 15")], marks="(2)")
    d.sup(TXT, "x", "2", after="+ 5x + 6 = 0", after_x=TXT + 14)
    d.text(N2, d.y, "1.1.2")
    d.text(MARKS, d.y, "(3)")
    d.skip(16)
    d.sup(N2 + 70, "Factorise fully: x", "2", after="− 9", after_x=N2 + 70 + 100)
    d.text(N1, d.y, "1.2")
    d.text(MARKS, d.y, "(2)")
    d.skip(16)
    d.row([(N1, "1.3"), (N2, "Calculate the value of 25 × 4.")], marks="(1)")
    d.row([(MARKS, "[8]")]).skip()
    d.row([(56, "QUESTION 2")]).skip()
    d.row([(N1, "Given the arithmetic sequence: 3 ; 7 ; 11 ; …")]).skip(4)
    d.row([(N1, "2.1"), (N2, "Write down the next term of the sequence.")], marks="(1)")
    d.row([(N1, "2.2"), (N2, "Determine the general term, Tn.")], marks="(2)")
    d.row([(N1, "2.3"), (N2, "Calculate the sum of the first 20 terms.")], marks="(3)")
    d.row([(N1, "2.4"), (N2, "A ball rolls 2.5 m down the incline in the first second.")])
    d.row([(N1, "2.5 m"), (N2 + 40, "is the distance covered in that first second.")])
    d.row([(N2, "Determine the distance covered in the third second.")], marks="(3)")
    d.row([(MARKS, "[9]")]).skip()
    d.row([(300, "TOTAL:"), (480, "30")])

    d.new_page()
    d.row([(200, "INFORMATION SHEET")])
    d.row([(N1, "1.1"), (N2, "A = P(1 + ni)")])
    return d.bytes()


def maths_memo() -> bytes:
    d = Doc("Mathematics/P1", "DBE/November 2024", "NSC – Marking Guidelines")
    d.new_page(cover=True)
    for y, s in [(200, "NATIONAL SENIOR CERTIFICATE"), (250, "GRADE 12"), (300, "MATHEMATICS P1"),
                 (330, "NOVEMBER 2024"), (360, "MARKING GUIDELINES"), (420, "MARKS: 30")]:
        d.text(200, y, s, size=14)

    d.new_page()
    d.row([(56, "NOTE:")])
    d.row([(56, "If a candidate answers a question TWICE, only mark the FIRST attempt.")])
    d.row([(56, "Consistent accuracy applies in ALL aspects of the marking guidelines.")])

    d.new_page()
    d.row([(56, "QUESTION 1")]).skip()
    d.row([(N1, "1.1.1"), (110, "2x = 10")], ticks=[(170, 1)])
    d.text(380, d.y - 16, "")
    d.row([(110, "x = 5"), (400, "answer")], marks="(2)", ticks=[(160, 1), (385, 1)])
    d.row([(N1, "1.1.2"), (110, "(x + 2)(x + 3) = 0"), (400, "factors")], ticks=[(385, 1)])
    d.row([(110, "x = −2 or x = −3"), (400, "answers")], marks="(3)", ticks=[(385, 2)])
    d.row([(N1, "1.2"), (110, "(x − 3)(x + 3)"), (400, "factors")], marks="(2)", ticks=[(385, 2)])
    d.row([(N1, "1.3"), (110, "100"), (400, "answer")], marks="(1)", ticks=[(385, 1)])
    d.row([(MARKS, "[8]")]).skip()
    d.row([(56, "QUESTION 2")]).skip()
    d.row([(N1, "2.1"), (110, "15"), (400, "answer")], marks="(1)", ticks=[(385, 1)])
    d.row([(N1, "2.2"), (110, "Tn = 4n − 1"), (400, "4n"), (440, "−1")], marks="(2)", ticks=[(385, 1), (428, 1)])
    d.row([(N1, "2.3"), (110, "S20 = 20/2 [2(3) + (20 − 1)(4)]"), (400, "subst")], ticks=[(385, 1)])
    d.row([(110, "= 820"), (400, "answer")], marks="(3)", ticks=[(385, 2)])
    d.row([(N1, "2.4"), (110, "T3 = 2.5 × 5 = 12.5 m"), (400, "method")], ticks=[(385, 1)])
    d.row([(110, "= 12.5 m"), (400, "answer")], marks="(3)", ticks=[(385, 2)])
    d.row([(MARKS, "[9]")]).skip()
    d.row([(300, "TOTAL:"), (480, "30")])
    return d.bytes()
