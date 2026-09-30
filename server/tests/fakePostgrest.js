"use strict";
/* A small stand-in for Supabase's REST API (PostgREST), just enough for nscRepo:
   filters (eq / in / is), select projection, order, paging + exact counts,
   single-row responses, unique-violation errors and the session-totals trigger.
   Tests point the real @supabase/supabase-js client at it. */
const http = require("node:http");
const crypto = require("node:crypto");

const RESERVED = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);

function makeTables() {
  return { nsc_papers: [], nsc_questions: [], nsc_memo_answers: [], nsc_quiz_sessions: [], nsc_quiz_attempts: [] };
}

/* Mirrors public.nsc_ingest_paper(): paper + questions + memo rows, counts computed the same way. */
function ingest(tables, { paper, questions }) {
  const id = tables.nsc_papers.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  const suitable = questions.filter((q) => q.is_recall_suitable);
  const slug = paper.subject.replace(/[^A-Za-z0-9]+/g, "_");
  const base = `NSC/${paper.year}/${paper.exam_session.replace("/", "-")}/${slug}/Paper_${paper.paper_number}`;
  tables.nsc_papers.push({
    // every nsc_papers column, as in the real table (null when empty)
    id, grade: 12, language: "English", processing_status: "ready", processing_notes: null, page_count: 12,
    total_marks: null, memo_page_count: null, memo_source_url: null, question_paper_sha256: null, memorandum_sha256: null,
    extractor_version: null, created_at: new Date().toISOString(), source_url: "https://www.education.gov.za",
    paper_title: `${paper.subject} Paper ${paper.paper_number}`,
    question_paper_storage_path: `${base}.pdf`, memorandum_storage_path: `${base}_Memorandum.pdf`,
    ...paper,
    question_count: questions.length, recall_question_count: suitable.length,
    auto_markable_count: suitable.filter((q) => q.is_auto_markable).length,
    updated_at: new Date().toISOString(),
  });
  for (const q of questions) {
    const qid = tables.nsc_questions.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    const { memo, ...row } = q;
    tables.nsc_questions.push({ id: qid, paper_id: id, has_figure: false, context_text: null, options: null, ...row });
    if (memo && String(memo.answer_text || "").trim()) {
      tables.nsc_memo_answers.push({ id: qid, question_id: qid, accepted_alternatives: [], keywords: [], answer_format: "text", ...memo });
    }
  }
  return id;
}

/* public.nsc_refresh_session_stats() */
function refreshSession(tables, sessionId) {
  const s = tables.nsc_quiz_sessions.find((x) => x.id === sessionId);
  if (!s) return;
  const a = tables.nsc_quiz_attempts.filter((x) => x.session_id === sessionId);
  const marked = a.filter((x) => x.is_correct !== null && x.is_correct !== undefined).length;
  s.answered_count = a.length;
  s.correct_count = a.filter((x) => x.is_correct === true).length;
  s.incorrect_count = a.filter((x) => x.is_correct === false).length;
  s.score = a.reduce((t, x) => t + Number(x.marks_awarded || 0), 0);
  const done = marked === s.question_count;
  s.percentage = done ? Math.round((10000 * s.correct_count) / s.question_count) / 100 : null;
  s.completed_at = done ? s.completed_at || new Date().toISOString() : null;
}

function matchesFilter(row, key, expr) {
  const v = row[key];
  if (expr.startsWith("eq.")) return String(v) === expr.slice(3);
  if (expr.startsWith("neq.")) return String(v) !== expr.slice(4);
  if (expr.startsWith("in.(")) {
    const list = expr.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
    return list.includes(String(v));
  }
  if (expr === "is.null") return v === null || v === undefined;
  if (expr === "is.true") return v === true;
  if (expr === "is.false") return v === false;
  throw new Error(`fake PostgREST: unsupported filter ${key}=${expr}`);
}

function project(row, select) {
  if (!select || select === "*") return { ...row };
  const out = {};
  for (const col of select.split(",").map((c) => c.trim()).filter(Boolean)) {
    if (!(col in row) && !["id"].includes(col)) throw Object.assign(new Error(`column ${col} does not exist`), { code: "42703" });
    out[col] = row[col];
  }
  return out;
}

function createFakePostgrest(tables = makeTables()) {
  const log = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      const send = (status, body, headers = {}) => {
        res.writeHead(status, { "Content-Type": "application/json", ...headers });
        res.end(body === undefined ? "" : JSON.stringify(body));
      };
      const fail = (status, code, message) => send(status, { code, message, details: null, hint: null });
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
        const accept = req.headers.accept || "";
        const prefer = req.headers.prefer || "";
        const wantsObject = accept.includes("vnd.pgrst.object");
        const adminUser = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/i);
        if (adminUser) {
          if (!(tables.__users || []).includes(adminUser[1])) return send(404, { code: 404, error_code: "user_not_found", msg: "User not found" });
          return send(200, { id: adminUser[1], email: "student@example.com", aud: "authenticated" });
        }
        const m = url.pathname.match(/^\/rest\/v1\/(?:rpc\/)?([a-z_]+)$/);
        if (!m) return fail(404, "PGRST125", "Invalid path");
        const name = m[1];
        log.push(`${req.method} ${name}?${url.searchParams.toString()}`);

        if (url.pathname.includes("/rpc/")) {
          if (name !== "nsc_paper_filter_options") return fail(404, "PGRST202", `no function ${name}`);
          const vis = tables.nsc_papers.filter((p) => ["ready", "partial"].includes(p.processing_status));
          const uniq = (k, desc) => [...new Set(vis.map((p) => p[k]))].sort((a, b) => (desc ? (a < b ? 1 : -1) : a < b ? -1 : 1));
          return send(200, {
            subjects: uniq("subject"), years: uniq("year", true), sessions: uniq("exam_session", true),
            grades: uniq("grade", true), paper_numbers: uniq("paper_number"),
          });
        }

        const table = tables[name];
        if (!table) return fail(404, "42P01", `relation "${name}" does not exist`);
        const filters = [...url.searchParams.entries()].filter(([k]) => !RESERVED.has(k));
        const select = url.searchParams.get("select");
        const selectRows = (rows) => {
          let out = rows.filter((r) => filters.every(([k, e]) => matchesFilter(r, k, e)));
          const total = out.length;
          const order = url.searchParams.get("order");
          if (order) {
            const keys = order.split(",").map((o) => o.split("."));
            out = [...out].sort((a, b) => {
              for (const [k, dir] of keys) {
                if (a[k] === b[k]) continue;
                return (a[k] < b[k] ? -1 : 1) * (dir === "desc" ? -1 : 1);
              }
              return 0;
            });
          }
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = url.searchParams.get("limit");
          out = out.slice(offset, limit ? offset + Number(limit) : undefined);
          return { rows: out, total, offset };
        };
        const respond = (rows, { status = 200, total, offset = 0 } = {}) => {
          const projected = rows.map((r) => project(r, select));
          const headers = {};
          if (prefer.includes("count=exact") && total !== undefined) {
            headers["Content-Range"] = projected.length ? `${offset}-${offset + projected.length - 1}/${total}` : `*/${total}`;
          }
          if (wantsObject) {
            if (projected.length !== 1) {
              return fail(406, "PGRST116", `JSON object requested, multiple (or no) rows returned (${projected.length} rows)`);
            }
            return send(status, projected[0], headers);
          }
          return send(status, projected, headers);
        };

        if (req.method === "GET" || req.method === "HEAD") {
          const { rows, total, offset } = selectRows(table);
          return respond(rows, { total, offset });
        }

        if (req.method === "POST") {
          const incoming = Array.isArray(body) ? body : [body];
          const created = [];
          for (const item of incoming) {
            const row = { ...item };
            if (name === "nsc_quiz_sessions") {
              Object.assign(row, {
                id: crypto.randomUUID(), parent_session_id: null, answered_count: 0, correct_count: 0, incorrect_count: 0,
                score: 0, percentage: null, started_at: new Date().toISOString(), completed_at: null, ...item,
              });
              if (row.question_count < 1 || row.question_count > 20) return fail(400, "23514", "new row violates check constraint (question_count)");
              if (row.question_ids.length !== row.question_count) return fail(400, "23514", "new row violates check constraint (count_matches)");
            } else if (name === "nsc_quiz_attempts") {
              if (table.some((a) => a.session_id === row.session_id && a.question_id === row.question_id)) {
                return fail(409, "23505", "duplicate key value violates unique constraint \"nsc_quiz_attempts_once\"");
              }
              if ((row.is_correct === null || row.is_correct === undefined) !== (row.marks_awarded === null || row.marks_awarded === undefined)) {
                return fail(400, "23514", "new row violates check constraint (marked_together)");
              }
              if (!tables.nsc_quiz_sessions.some((s) => s.id === row.session_id)) return fail(409, "23503", "foreign key violation (session_id)");
              Object.assign(row, { answered_at: new Date().toISOString(), id: table.length + 1, ...item });
            } else {
              return fail(403, "42501", `permission denied for table ${name}`);
            }
            table.push(row);
            if (name === "nsc_quiz_attempts") refreshSession(tables, row.session_id);
            created.push(row);
          }
          return prefer.includes("return=representation") ? respond(created, { status: 201 }) : send(201);
        }

        if (req.method === "PATCH") {
          const { rows } = selectRows(table);
          rows.forEach((r) => Object.assign(r, body));
          if (name === "nsc_quiz_attempts") rows.forEach((r) => refreshSession(tables, r.session_id));
          return prefer.includes("return=representation") ? respond(rows) : send(204);
        }
        return fail(405, "PGRST", "method not allowed");
      } catch (err) {
        return fail(err.code === "42703" ? 400 : 500, err.code || "XX000", err.message);
      }
    });
  });
  return { server, tables, log };
}

async function listen(fake) {
  await new Promise((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${fake.server.address().port}`;
}

module.exports = { createFakePostgrest, makeTables, ingest, listen, refreshSession };
