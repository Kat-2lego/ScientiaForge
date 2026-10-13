"use strict";
/* A generic fake PostgREST for the vd_ tables. Columns, defaults, NOT NULL, unique keys and
   simple CHECK rules are read from the real migration file, so code/schema drift fails tests.
   Implements what supabase-js sends: select, eq/in/gte/gt/lt/lte filters, order, limit,
   upsert (on_conflict + resolution=merge-duplicates), update, delete, and the vd_ RPCs. */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATION = path.join(__dirname, "..", "..", "supabase", "migrations", "20260929_video_discovery.sql");

function parseSchema(sql = fs.readFileSync(MIGRATION, "utf8")) {
  const tables = {};
  const re = /create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g;
  for (const [, name, body] of sql.matchAll(re)) {
    const cols = {};
    const uniques = [];
    for (const raw of body.split("\n")) {
      const line = raw.replace(/--.*$/, "").trim().replace(/,$/, "");
      if (!line) continue;
      let m;
      if ((m = /^(?:constraint \w+ )?(?:unique|primary key) \(([^)]+)\)/.exec(line))) { uniques.push(m[1].split(",").map((s) => s.trim())); continue; }
      if ((m = /^(\w+)\s+(bigint|text\[\]|text|smallint|integer|boolean|timestamptz|uuid|date)\b(.*)$/.exec(line))) {
        const [, col, type, rest] = m;
        const c = { type, notNull: /not null|primary key/.test(rest), identity: /generated always as identity/.test(rest) };
        const def = /default ([^ ]+(?: \(\))?)/.exec(rest);
        if (def) c.default = def[1];
        const pat = /check \([^~]*~ '([^']+)'\)/.exec(rest);
        if (pat) c.pattern = new RegExp(pat[1]);
        const list = /(\w+) in \(([\s\S]*)\)\)/.exec(rest) || (/in \(([^)]*)\)/.exec(rest) && [null, col, /in \(([^)]*)\)/.exec(rest)[1]]);
        if (list && !pat) c.allowed = list[2].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
        if (/primary key/.test(rest)) uniques.push([col]);
        cols[col] = c;
      }
    }
    tables[name] = { cols, uniques };
  }
  return tables;
}

// the reason list spans several lines in the migration; pick it up separately
function reasonList(sql = fs.readFileSync(MIGRATION, "utf8")) {
  const m = /reason\s+text\s+check \(reason is null or reason in \(([\s\S]*?)\)\)/.exec(sql);
  return m ? m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1)) : null;
}

function createFakeVideoPostgrest({ now = () => new Date() } = {}) {
  const schema = parseSchema();
  const reasons = reasonList();
  if (reasons) schema.vd_feedback.cols.reason.allowed = reasons;
  const data = Object.fromEntries(Object.keys(schema).map((t) => [t, []]));
  let seq = 1;
  const log = [];

  const err = (status, code, message) => Object.assign(new Error(message), { status, code });
  function applyDefaults(table, row) {
    const out = { ...row };
    for (const [col, c] of Object.entries(schema[table].cols)) {
      if (out[col] !== undefined) continue;
      if (c.identity) out[col] = seq++;
      else if (c.default === "now()") out[col] = now().toISOString();
      else if (c.default === "'{}'") out[col] = [];
      else if (c.default && /^'.*'$/.test(c.default)) out[col] = c.default.slice(1, -1);
      else if (c.default === "true" || c.default === "false") out[col] = c.default === "true";
      else if (c.default && /^\d+$/.test(c.default)) out[col] = Number(c.default);
      else out[col] = null;
    }
    return out;
  }
  function validate(table, row) {
    for (const col of Object.keys(row)) if (!schema[table].cols[col]) throw err(400, "PGRST204", `Could not find the '${col}' column of '${table}'`);
    for (const [col, c] of Object.entries(schema[table].cols)) {
      const v = row[col];
      if (c.notNull && (v === null || v === undefined)) throw err(400, "23502", `null value in column "${col}" of "${table}"`);
      if (v !== null && v !== undefined && c.pattern && !c.pattern.test(String(v))) throw err(400, "23514", `check constraint on ${table}.${col}`);
      if (v !== null && v !== undefined && c.allowed && !c.allowed.includes(v)) throw err(400, "23514", `check constraint on ${table}.${col} (${v})`);
    }
  }
  function col(table, name) {
    if (!schema[table].cols[name]) throw err(400, "42703", `column ${table}.${name} does not exist`);
    return name;
  }
  function filterRows(table, params) {
    let rows = data[table];
    for (const [key, expr] of params) {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
      col(table, key);
      const [op, ...restParts] = expr.split(".");
      const val = restParts.join(".");
      rows = rows.filter((r) => {
        const v = r[key];
        switch (op) {
          case "eq": return String(v) === val;
          case "in": return val.slice(1, -1).split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(v));
          case "gte": return v !== null && String(v) >= val;
          case "gt": return v !== null && String(v) > val;
          case "lt": return v !== null && String(v) < val;
          case "lte": return v !== null && String(v) <= val;
          default: throw err(400, "PGRST100", `unsupported operator ${op}`);
        }
      });
    }
    return rows;
  }
  function project(table, rows, select) {
    if (!select || select === "*") return rows.map((r) => ({ ...r }));
    const cols = select.split(",").map((s) => s.trim()).filter(Boolean).map((c) => col(table, c));
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
  }
  function order(table, rows, spec) {
    if (!spec) return rows;
    const [c, dir = "asc"] = spec.split(".");
    col(table, c);
    return [...rows].sort((a, b) => (a[c] === b[c] ? 0 : (a[c] > b[c] ? 1 : -1) * (dir === "desc" ? -1 : 1)));
  }

  const rpc = {
    vd_charge_quota({ p_search_calls, p_units, p_max_search_calls, p_max_units }) {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now());
      let row = data.vd_api_usage.find((r) => r.usage_date === day);
      if (!row) data.vd_api_usage.push((row = { usage_date: day, search_calls: 0, units: 0 }));
      if (row.search_calls + p_search_calls > p_max_search_calls || row.units + p_units > p_max_units) return false;
      row.search_calls += p_search_calls;
      row.units += p_units;
      return true;
    },
    vd_feedback_stats({ p_video_ids }) {
      const out = new Map();
      for (const f of data.vd_feedback) {
        if (!p_video_ids.includes(f.provider_video_id)) continue;
        const s = out.get(f.provider_video_id) || { provider_video_id: f.provider_video_id, useful_votes: 0, not_useful_votes: 0 };
        f.useful ? s.useful_votes++ : s.not_useful_votes++;
        out.set(f.provider_video_id, s);
      }
      return [...out.values()];
    },
    vd_purge_stale({ p_max_age_days }) {
      const cut = new Date(now().getTime() - Math.min(30, p_max_age_days) * 86400000).toISOString();
      const before = data.vd_videos.length;
      data.vd_videos = data.vd_videos.filter((v) => v.fetched_at >= cut);
      return { videos: before - data.vd_videos.length, search_caches: 0, channels: 0 };
    },
  };

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    const url = new URL(req.url, "http://x");
    const params = [...url.searchParams.entries()];
    const prefer = req.headers.prefer || "";
    const wantsObject = String(req.headers.accept || "").includes("vnd.pgrst.object");
    log.push({ method: req.method, path: url.pathname, params: Object.fromEntries(params), prefer });
    const send = (status, payload) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(payload === undefined ? "" : JSON.stringify(payload)); };
    try {
      const m = /^\/rest\/v1\/(rpc\/)?(\w+)$/.exec(url.pathname);
      if (!m) throw err(404, "PGRST125", "Invalid path");
      const [, isRpc, name] = m;
      if (isRpc) {
        if (!rpc[name]) throw err(404, "PGRST202", `Could not find the function public.${name}`);
        return send(200, rpc[name](body || {}));
      }
      if (!schema[name]) throw err(404, "42P01", `relation "public.${name}" does not exist`);
      const get = (k) => url.searchParams.get(k);
      let out;
      if (req.method === "GET") {
        let rows = order(name, filterRows(name, params), get("order"));
        if (get("limit")) rows = rows.slice(0, Number(get("limit")));
        out = project(name, rows, get("select"));
      } else if (req.method === "POST") {
        const rows = (Array.isArray(body) ? body : [body]).map((r) => applyDefaults(name, r));
        const conflict = get("on_conflict") ? get("on_conflict").split(",") : null;
        if (conflict && !schema[name].uniques.some((u) => u.join(",") === conflict.join(","))) {
          throw err(400, "42P10", `there is no unique or exclusion constraint matching the ON CONFLICT specification (${conflict})`);
        }
        const written = [];
        for (const row of rows) {
          validate(name, row);
          const clash = data[name].find((r) => schema[name].uniques.some((u) => u.every((c) => String(r[c]) === String(row[c]))));
          if (clash) {
            if (!conflict || !prefer.includes("resolution=merge-duplicates")) throw err(409, "23505", "duplicate key value violates unique constraint");
            const incoming = Array.isArray(body) ? body.find((b) => conflict.every((c) => String(b[c] ?? row[c]) === String(row[c]))) : body;
            for (const k of Object.keys(incoming)) clash[k] = row[k];
            written.push(clash);
          } else {
            data[name].push(row);
            written.push(row);
          }
        }
        out = prefer.includes("return=representation") ? project(name, written, get("select")) : undefined;
      } else if (req.method === "PATCH") {
        const rows = filterRows(name, params);
        for (const r of rows) { Object.assign(r, body); validate(name, r); }
        out = prefer.includes("return=representation") ? project(name, rows, get("select")) : undefined;
      } else if (req.method === "DELETE") {
        const rows = new Set(filterRows(name, params));
        data[name] = data[name].filter((r) => !rows.has(r));
        out = undefined;
      }
      if (wantsObject) {
        if (!out || out.length !== 1) throw err(406, "PGRST116", "JSON object requested, multiple (or no) rows returned");
        return send(200, out[0]);
      }
      return out === undefined ? send(req.method === "POST" ? 201 : 204) : send(200, out);
    } catch (e) {
      return send(e.status || 500, { code: e.code, message: e.message, details: null, hint: null });
    }
  });

  return {
    data, log, schema,
    async listen() {
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      return `http://127.0.0.1:${server.address().port}`;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

module.exports = { createFakeVideoPostgrest, parseSchema };
