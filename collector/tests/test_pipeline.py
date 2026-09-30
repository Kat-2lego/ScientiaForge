"""The whole run with a fake DBE site and a fake Supabase: dedupe, failure isolation, payload."""
import json

import pdf_fixtures as fx
from nsc.config import Settings
from nsc.pipeline import Collector, RunOptions

INDEX = """<html><body>
<a href="https://www.education.gov.za/2023Nov.aspx">2023 November NSC Examination Papers</a>
<a href="https://www.education.gov.za/2012Nov.aspx">2012 November NSC Examination Papers</a>
</body></html>"""
EXAM = """<html><body><div id="dnn_ContentPane">
<h2>NON LANGUAGES</h2>
<h2>Life Sciences</h2><table>
<a href="/LinkClick.aspx?fileticket=ls1&tabid=1">Paper 1 (English)</a>
<a href="/LinkClick.aspx?fileticket=ls1m&tabid=1">Memo 1 (English)</a>
<a href="/LinkClick.aspx?fileticket=ls2&tabid=1">Paper 2 (English)</a>
<a href="/LinkClick.aspx?fileticket=ls2m&tabid=1">Memo 2 (English)</a></table>
<h2>Mathematics</h2><table>
<a href="/LinkClick.aspx?fileticket=m1&tabid=1">Paper 1 (English)</a>
<a href="/LinkClick.aspx?fileticket=m1m&tabid=1">Memo 1 (English)</a></table>
<h2>Mathematical Literacy</h2><table>
<a href="/LinkClick.aspx?fileticket=ml1&tabid=1">Paper 1 (English)</a></table>
</div></body></html>"""


class FakeWeb:
    def __init__(self):
        self.downloads = []
        self.docs = {
            "ls1": fx.life_sciences_paper(), "ls1m": fx.life_sciences_memo(),
            "ls2": b"<!DOCTYPE html><html>error</html>",      # broken link -> failure
            "m1": fx.maths_paper(), "m1m": fx.maths_memo(),
            "ml1": fx.maths_paper(),                          # wrong subject on the cover -> failure
        }

    def get_html(self, url):
        if "2023Nov" in url:
            return url, EXAM
        return url, INDEX

    def download(self, url):
        ticket = url.split("fileticket=")[1].split("&")[0]
        self.downloads.append(ticket)
        return self.docs[ticket]


class FakeClient:
    def __init__(self, existing=None):
        self.existing = existing or {}
        self.uploads, self.rpcs = [], []

    def existing_papers(self):
        return self.existing

    def check_bucket(self):
        pass

    def upload(self, path, data, content_type="application/pdf"):
        self.uploads.append(path)

    def rpc(self, fn, payload):
        self.rpcs.append((fn, json.loads(json.dumps(payload))))
        return len(self.rpcs)


def make(tmp_path, client, **opts):
    settings = Settings(cache_dir=tmp_path / "c", log_dir=tmp_path / "logs", out_dir=tmp_path / "out", request_delay=0)
    col = Collector(settings, RunOptions(**opts), client)
    col.web = FakeWeb()
    return col


def test_full_run(tmp_path):
    existing = {(2023, "November", 12, "Mathematics", 1, "English"): {"processing_status": "ready", "extractor_version": "1.0.0"}}
    client = FakeClient(existing)
    col = make(tmp_path, client)
    summary = col.run()
    status = {r.label.split(" — ")[0]: r.status for r in summary.results}

    assert summary.exam_pages == 1  # 2012 is older than --since
    assert status["Mathematics Paper 1"] == "skipped"
    assert status["Life Sciences Paper 1"] == "ready"
    assert status["Life Sciences Paper 2"] == "failed"
    assert status["Mathematical Literacy Paper 1"] == "failed"
    assert "m1" not in col.web.downloads  # already stored: never downloaded

    assert client.uploads == [
        "NSC/2023/November/Life_Sciences/Paper_1.pdf",
        "NSC/2023/November/Life_Sciences/Paper_1_Memorandum.pdf",
    ]
    fn, payload = client.rpcs[0]
    assert fn == "nsc_ingest_paper"
    paper = payload["p_paper"]
    assert paper["processing_status"] == "ready" and paper["total_marks"] == 50
    assert paper["paper_title"] == "Life Sciences Paper 1"
    assert all("_reasons" not in q for q in payload["p_questions"])
    assert sum(q["is_recall_suitable"] for q in payload["p_questions"]) >= 10

    failures = [json.loads(l) for l in (tmp_path / "logs" / "failures.jsonl").read_text().splitlines()]
    assert {f["paper"].split(" — ")[0] for f in failures} == {"Life Sciences Paper 2", "Mathematical Literacy Paper 1"}
    assert any("cover says" in f["error"] for f in failures)


def test_paper_without_memo_is_partial(tmp_path):
    client = FakeClient()
    col = make(tmp_path, client, subjects=["mathematics"])
    col.web.docs["m1m"] = fx.maths_paper()  # memo link points at the question paper
    col.run()
    maths = next(p for fn, p in client.rpcs if p["p_paper"]["subject"] == "Mathematics")
    assert maths["p_paper"]["processing_status"] == "partial"
    assert maths["p_paper"]["memorandum_storage_path"] is None
    assert not any(q["is_recall_suitable"] for q in maths["p_questions"])
    assert "memo not usable" in maths["p_paper"]["processing_notes"]


def test_dry_run_downloads_nothing(tmp_path):
    col = make(tmp_path, None, dry_run=True)
    summary = col.run()
    assert col.web.downloads == []
    assert summary.count("planned") == 4


def test_no_upload_writes_json(tmp_path):
    col = make(tmp_path, None, no_upload=True, subjects=["life sciences"], papers={1})
    col.run()
    files = list((tmp_path / "out").glob("*.json"))
    assert len(files) == 1
    data = json.loads(files[0].read_text())
    assert data["paper"]["subject"] == "Life Sciences"
    assert any(q["_reasons"] for q in data["questions"])  # QA output keeps the reasons


def test_empty_exam_page_is_explained_and_saved(tmp_path, caplog):
    import logging
    client = FakeClient()
    col = make(tmp_path, client, subjects=["mathematics"])
    col.web.get_html = lambda url: (url, "<html><head><title>Request Rejected</title></head><body>Blocked</body></html>")
    with caplog.at_level(logging.WARNING, logger="nsc"):
        from nsc.discovery import ExamPage
        found = col.candidates_for(ExamPage(2024, "November", "https://www.education.gov.za/x.aspx", "test"))
    assert found == []
    assert any("Request Rejected" in r.getMessage() for r in caplog.records)
    assert (tmp_path / "logs" / "empty_page_2024_November.html").read_text().startswith("<html>")


def test_review_report_lists_what_students_get(tmp_path):
    col = make(tmp_path, None, no_upload=True, subjects=["life sciences"], papers={1})
    col.run()
    from nsc.review import review_json
    report = review_json(next((tmp_path / "out").glob("*.json")))
    assert "Life Sciences Paper 1" in report
    assert "what students get" in report and "MEMO: D" in report          # 1.1.1 with its memo letter
    assert "why questions were left out" in report and "figure, table or source" in report
    assert "=>   MEMO: Urethra" in report


def test_summary_table_lists_every_parsed_paper(tmp_path):
    col = make(tmp_path, None, no_upload=True, subjects=["life sciences", "mathematics", "mathematical literacy"], papers={1})
    col.run()
    from nsc.review import summarise_dir
    table = summarise_dir(tmp_path / "out")
    assert "Life Sciences P1" in table and "Mathematics P1" in table
    assert "ready" in table and "12" in table                       # 12 usable Life Sciences questions
    assert "papers parsed" in table
    assert "No parsed papers" in summarise_dir(tmp_path / "nothing-here")
