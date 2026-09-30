"""DBE page parsing: exam-page discovery and paper/memo pairing."""
from nsc.discovery import build_candidates, normalise_session, parse_exam_page, parse_index_page
from nsc.subjects import parse_title

BASE = "https://www.education.gov.za"


def link(ticket, text, download=True):
    href = f"/LinkClick.aspx?fileticket={ticket}%3d&tabid=4682&portalid=0&mid=1"
    out = f'<tr><td></td><td><a href="{href}">{text}</a></td>'
    if download:
        out += f'<td><a href="{href}&forcedownload=true">Download</a></td>'
    return out + "</tr>"


INDEX_HTML = f"""
<html><body><div id="dnn_ContentPane">
<a href="/LinkClick.aspx?link=https%3a%2f%2fwww.education.gov.za%2f2024NSCNovemberpastpapers.aspx&tabid=1">2024 November NSC Examination Papers</a>
<a href="/LinkClick.aspx?link=4800&tabid=1">2025 May/June NSC/SC Examination Papers</a>
<a href="/x.aspx">2025 NSC Examination Timetable</a>
<a href="/y.aspx">2024 Grade 11 Common Paper exemplars</a>
<a href="/z.aspx">2019 Feb/March NSC Examination Papers</a>
</div></body></html>
"""

EXAM_HTML = f"""
<html><head><title>2023 NSC November past papers</title></head><body><div id="dnn_ContentPane">
<h2>LANGUAGES</h2>
<h2>English</h2><table>
{link("e1", "English FAL P1")}{link("e2", "English FAL P1 memo")}
{link("e3", "English HL P2")}{link("e4", "English HL P2 memo")}
</table>
<h2>Sepedi</h2><table>
{link("s1", "Sepedi SAL P2 (Gauteng)")}{link("s2", "Sepedi HL P1")}{link("s3", "Sepedi HL P1 memo")}
</table>
<h2>South African Sign Language (Final)</h2><table>
{link("sl1", "SASL HL P1(ppt)")}{link("sl2", "SASL HL Paper 1")}{link("sl3", "SASL HL Memo 1")}
</table>
<h2>NON LANGUAGES</h2>
<h2>Accounting</h2><table>
{link("a1", "Memo 1 (Afrikaans)")}{link("a2", "Memo 1 (English)")}
{link("a3", "Paper 1 (Afrikaans)")}{link("a4", "Paper 1 (English)")}
{link("a5", "Paper 1 Answer Book (English)")}
</table>
<h2>Mathematics</h2><table>
{link("m1", "Paper 2 Answerbook (English &amp; Afrikaans)")}{link("m2", "Paper 2 (English)")}
{link("m3", "Memo 2 (Afrikaans &amp; English)")}{link("m4", "Paper 1 (English)")}
</table>
<h2>Civil Technology</h2><table>
{link("c1", "Civil Services Paper 1 (English)")}{link("c2", "Civil Services Memo 1 (English)")}
{link("c3", "Woodworking Paper 1 (English)")}
</table>
<h2>Engineering Graphic and Design</h2><table>{link("g1", "Paper 1 (English)")}{link("g2", "Memo 1 (English)")}</table>
<h2>History</h2><table>{link("h1", "Paper 1 (English)")}{link("h2", "Paper 1 Addendum (English)")}{link("h3", "Memo 1 (English)")}</table>
</div></body></html>
"""


def test_sessions():
    assert normalise_session("2025 November NSC") == "November"
    assert normalise_session("May/June NSC/SC Examination Papers") == "May/June"
    assert normalise_session("Feb/March") == "Feb/March"
    assert normalise_session("Timetable") is None


def test_index_page():
    pages = parse_index_page(INDEX_HTML, BASE + "/Curriculum/NSC.aspx")
    assert [(p.year, p.session) for p in pages] == [(2025, "May/June"), (2024, "November"), (2019, "Feb/March")]
    nov = next(p for p in pages if p.year == 2024)
    assert nov.url == "https://www.education.gov.za/2024NSCNovemberpastpapers.aspx"  # LinkClick unwrapped


def test_parse_titles():
    t = parse_title("Mathematics", "Memo 2 (Afrikaans & English)")
    assert (t.subject, t.kind, t.paper_number, t.doc_language) == ("Mathematics", "memo", 2, "Both")
    t = parse_title("Civil Technology", "Civil Services Paper 1 (English)")
    assert t.subject == "Civil Technology: Civil Services" and t.kind == "paper"
    t = parse_title("English", "English FAL P1 memo")
    assert (t.subject, t.kind, t.paper_number, t.is_language_subject) == ("English First Additional Language", "memo", 1, True)
    assert parse_title("Sepedi", "Sepedi SAL P2 (Gauteng)").province == "Gauteng"
    assert parse_title("South African Sign Language (Final)", "SASL HL P1(ppt)").skip_reason
    assert parse_title("Engineering Graphic and Design", "Paper 1 (English)").subject == "Engineering Graphics and Design"
    assert parse_title("Accounting", "Paper 1 Answer Book (English)").kind == "answer_book"
    assert parse_title("History", "Paper 1 Addendum (English)").kind == "addendum"


def test_exam_page_links_skip_download_duplicates():
    links = parse_exam_page(EXAM_HTML, BASE + "/2023.aspx")
    assert not any(l.title == "Download" for l in links)
    assert all("forcedownload" not in l.url for l in links)
    assert links[0].heading == "English" and links[0].title == "English FAL P1"


def test_candidates_english_mode():
    links = parse_exam_page(EXAM_HTML, BASE + "/2023.aspx")
    cands = build_candidates(links, 2023, "November", BASE + "/2023.aspx", "english")
    got = {(c.subject, c.paper_number): (c.qp.title, c.memo.title if c.memo else None) for c in cands}
    assert got[("Accounting", 1)] == ("Paper 1 (English)", "Memo 1 (English)")  # English preferred
    assert got[("Mathematics", 2)] == ("Paper 2 (English)", "Memo 2 (Afrikaans & English)")  # bilingual memo ok
    assert got[("Mathematics", 1)] == ("Paper 1 (English)", None)  # no memo listed
    assert got[("Civil Technology: Civil Services", 1)][1] == "Civil Services Memo 1 (English)"
    assert got[("English First Additional Language", 1)] == ("English FAL P1", "English FAL P1 memo")
    assert got[("History", 1)] == ("Paper 1 (English)", "Memo 1 (English)")  # addendum not used as paper
    assert not any(s.startswith("Sepedi") for s, _ in got)  # english mode
    assert not any("Sign Language" in s for s, _ in got)


def test_candidates_all_languages_skip_provincial():
    links = parse_exam_page(EXAM_HTML, BASE + "/2023.aspx")
    cands = build_candidates(links, 2023, "November", BASE, "all")
    subjects = {(c.subject, c.paper_number) for c in cands}
    assert ("Sepedi Home Language", 1) in subjects
    assert ("Sepedi Second Additional Language", 2) not in subjects  # provincial only
    assert ("South African Sign Language Home Language", 1) in subjects  # PDF kept, ppt skipped


# ---------------------------------------------------------------------------
# The real 2024 November page (education.gov.za), reduced: same headings, same
# titles, same ticket URLs. The papers sit in a DNN pane that is NOT called
# dnn_ContentPane, which is what broke the first version of the parser.
# ---------------------------------------------------------------------------
def _row(title, ticket, mid):
    href = f"https://www.education.gov.za/LinkClick.aspx?fileticket={ticket}%3d&tabid=5193&portalid=0&mid={mid}"
    return f'<tr><td></td><td><a href="{href}">{title}</a></td><td><a href="{href}&forcedownload=true">Download</a></td></tr>'


REAL_LAYOUT_HTML = f"""
<html><head><title>2024 NSC November past papers</title></head><body>
<div id="dnn_Header"><ul class="menu"><li><a href="https://www.education.gov.za/Home.aspx">Home</a></li>
  <li><a href="https://www.education.gov.za/Curriculum/NationalSeniorCertificate(NSC)Examinations.aspx">NSC</a></li></ul></div>
<div id="dnn_ContentPane" class="DNNEmptyPane"></div>
<div id="dnn_LeftPane">
  <a href="https://www.education.gov.za/2024NSCNovemberpastpapers.aspx">2024 NSC November past papers</a>
  <div class="DnnModule"><h2>LANGUAGES</h2></div>
  <div class="DnnModule"><h2>English</h2><table>
    {_row("English FAL P1", "ZJZsyNpCu9Y", 13691)}{_row("English FAL P1 memo", "DLSKutp56QU", 13691)}
  </table></div>
  <div class="DnnModule"><h2>NON LANGUAGES</h2></div>
  <div class="DnnModule"><h2>Life Sciences</h2><table>
    {_row("Memo 1 (Afrikaans)", "UYFH6ze-JLU", 13722)}{_row("Memo 1 (English)", "4RuUffqAKn4", 13722)}
    {_row("Paper 1 (Afrikaans)", "ehB5Wf8uWl8", 13722)}{_row("Paper 1 (English)", "UH53U88PRPE", 13722)}
  </table></div>
  <div class="DnnModule"><span id="dnn_ctr13724_dnnTITLE_titleLabel" class="Head">Mathematics</span><table>
    {_row("Paper 2 Answerbook (English & Afrikaans)", "bO2LGxnHL_M", 13724)}{_row("Paper 2 (English)", "ycHWvBVvV2M", 13724)}
    {_row("Paper 1 (English)", "8W2dAxBUTQA", 13724)}{_row("Paper 1 (Afrikaans)", "JEqOMNWPEl8", 13724)}
    {_row("Memo 2 (Afrikaans & English)", "0DIM92_2Vu8", 13724)}{_row("Memo 1 (Afrikaans and English)", "D_T4clPBpkk", 13724)}
  </table></div>
</div>
<div id="dnn_Footer"><h3>National Office</h3><a href="tel:0123573000">012 357 3000</a></div>
</body></html>
"""


def test_real_layout_papers_outside_content_pane():
    links = parse_exam_page(REAL_LAYOUT_HTML, "https://www.education.gov.za/2024NSCNovemberpastpapers.aspx")
    headings = {l.heading for l in links}
    assert headings == {"English", "Life Sciences", "Mathematics"}
    assert len(links) == 2 + 4 + 6
    assert all("forcedownload" not in l.url and l.url.startswith("https://www.education.gov.za/LinkClick.aspx?fileticket=") for l in links)


def test_real_layout_pairs_maths_with_its_bilingual_memos():
    links = parse_exam_page(REAL_LAYOUT_HTML, "https://www.education.gov.za/2024NSCNovemberpastpapers.aspx")
    cands = build_candidates(links, 2024, "November", "https://www.education.gov.za/2024NSCNovemberpastpapers.aspx", "english")
    got = {(c.subject, c.paper_number): (c.qp.title, c.memo.title if c.memo else None) for c in cands}
    assert got[("Mathematics", 1)] == ("Paper 1 (English)", "Memo 1 (Afrikaans and English)")
    assert got[("Mathematics", 2)] == ("Paper 2 (English)", "Memo 2 (Afrikaans & English)")
    assert got[("Life Sciences", 1)] == ("Paper 1 (English)", "Memo 1 (English)")


def test_describe_page_reports_what_came_back():
    from nsc.discovery import describe_page
    text = describe_page("<html><head><title>Request Rejected</title></head><body><h1>Blocked</h1></body></html>")
    assert "Request Rejected" in text and "0 fileticket" in text
