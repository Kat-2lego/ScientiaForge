/**
 * NSC Active Recall — answer marking (no AI, no paid APIs).
 *
 * markAnswer(userAnswer, memo) -> { verdict, normalized }
 *   verdict: "correct" | "incorrect" | "needs_self_mark"
 *
 * memo = { answer_format, accepted_answer, accepted_alternatives, keywords }
 *   letter      MCQ letter A–D
 *   boolean     True / False
 *   number      final numeric value(s); units ignored, 5 = 5.0 = 5,00
 *   expression  algebraic answer, e.g. (x − 3)(x + 3) in any factor order
 *   term        short word/phrase; small spelling slips accepted (NSC marking
 *               principle: recognisable spelling errors are credited)
 *   text        never auto-marked: the student compares with the memo
 *
 * When an answer is close but not an exact match (e.g. it shares key words
 * with the memo), the verdict is "needs_self_mark" instead of a harsh
 * "incorrect": the student sees the memo and decides.
 */
"use strict";

const SUPERSCRIPTS = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5",
  "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+",
};
const ARTICLES = new Set(["a", "an", "the"]);

function toStr(v) {
  return v == null ? "" : String(v);
}

function unifyChars(s) {
  return toStr(s)
    .normalize("NFKC")
    .replace(/[\u2212\u2013\u2014\u2012]/g, "-") // minus sign and dashes
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u00a0\u2009\u202f]/g, " ");
}

function superscriptsToCaret(s) {
  return s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => "^" + [...m].map((c) => SUPERSCRIPTS[c]).join(""));
}

/* ------------------------------------------------------------------ text */
function normalizeText(s) {
  const words = unifyChars(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/['-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && ARTICLES.has(words[0])) words.shift();
  return words.join(" ");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function allowedTypos(len) {
  if (len >= 10) return 2;
  if (len >= 6) return 1;
  return 0;
}

function closeEnough(a, b) {
  return levenshtein(a, b) <= allowedTypos(Math.max(a.length, b.length));
}

function containsPhrase(haystackWords, needleWords) {
  if (!needleWords.length || needleWords.length > haystackWords.length) return false;
  for (let i = 0; i + needleWords.length <= haystackWords.length; i++) {
    let ok = true;
    for (let j = 0; j < needleWords.length; j++) {
      if (!closeEnough(haystackWords[i + j], needleWords[j])) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function markTerm(answer, memo) {
  const student = normalizeText(answer);
  const candidates = [memo.accepted_answer, ...(memo.accepted_alternatives || [])]
    .map(normalizeText)
    .filter(Boolean);
  if (!student || !candidates.length) return { verdict: "incorrect", normalized: student };

  const sWords = student.split(" ");
  for (const cand of candidates) {
    if (student === cand) return { verdict: "correct", normalized: student };
    // typo tolerance is per word: "fertilization" ~ "fertilisation", but "internal" != "external"
    const cWords = cand.split(" ");
    // "it is the placenta" still contains the whole term without much padding
    if (sWords.length <= cWords.length + 3 && containsPhrase(sWords, cWords)) {
      return { verdict: "correct", normalized: student };
    }
  }

  // Partly there? Let the student judge against the memo instead of failing them.
  const keyWords = [...(memo.keywords || []), ...candidates]
    .map(normalizeText)
    .flatMap((k) => k.split(" "))
    .filter((w) => w.length >= 4);
  const overlap = sWords.some((w) => w.length >= 4 && keyWords.some((k) => closeEnough(w, k)));
  return { verdict: overlap ? "needs_self_mark" : "incorrect", normalized: student };
}

/* ------------------------------------------------------------------ letters / booleans */
function markLetter(answer, memo) {
  const m = unifyChars(answer).trim().match(/^\(?\s*([A-Da-d])\s*\)?(?:[\s.:,)-]|$)/);
  const letter = m ? m[1].toUpperCase() : "";
  const expected = toStr(memo.accepted_answer).trim().toUpperCase();
  return { verdict: letter && letter === expected ? "correct" : "incorrect", normalized: letter };
}

const TRUE_WORDS = new Set(["true", "t", "yes", "y", "waar", "correct", "right"]);
const FALSE_WORDS = new Set(["false", "f", "no", "n", "onwaar", "incorrect", "wrong"]);

function markBoolean(answer, memo) {
  const first = normalizeText(answer).split(" ")[0] || "";
  const value = TRUE_WORDS.has(first) ? "True" : FALSE_WORDS.has(first) ? "False" : "";
  const expected = normalizeText(memo.accepted_answer).startsWith("t") ? "True" : "False";
  return { verdict: value && value === expected ? "correct" : "incorrect", normalized: value };
}

/* ------------------------------------------------------------------ numbers */
function decimalsOf(numText) {
  const m = numText.match(/[.,](\d+)(?:e|$)/i);
  return m ? m[1].length : 0;
}

/**
 * The value(s) an answer gives. "x = 2 or x = -3" -> [2, -3];
 * "a = 8 m·s⁻²" -> [8]; "R1 250,50" -> [1250.5]; "6,02 × 10²³" -> [6.02e23].
 * Each part's value is what follows its last "=". A comma is a (South African)
 * decimal comma unless a space follows it, in which case it separates answers.
 */
function extractValues(text, { commaThousands = false } = {}) {
  const s = superscriptsToCaret(unifyChars(text)).replace(/^\s*∴\s*/, "");
  const parts = s
    .split(/\s+or\s+|\s+and\s+|;|,\s+|\n/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const values = [];
  for (const part of parts) {
    let v = part.includes("=") ? part.slice(part.lastIndexOf("=") + 1) : part;
    v = v.replace(/^\s*(?:R|ZAR)\s*/i, "");
    v = v.replace(/(\d) (?=\d{3}(?!\d))/g, "$1"); // 1 250 000
    const sci = v.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[×xX*]\s*10\s*\^?\s*\(?\s*(-?\d+)\s*\)?/);
    if (sci) {
      const mantissa = parseFloat(sci[1].replace(",", "."));
      values.push({ value: mantissa * Math.pow(10, parseInt(sci[2], 10)), decimals: decimalsOf(sci[1]), sci: true });
      continue;
    }
    const frac = v.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*$/);
    if (frac) {
      const den = parseFloat(frac[2].replace(",", "."));
      if (den !== 0) values.push({ value: parseFloat(frac[1].replace(",", ".")) / den, decimals: 6, sci: false });
      continue;
    }
    const num = v.match(/-?\d+(?:[.,]\d+)*(?:e-?\d+)?/i);
    if (!num) continue;
    let raw = num[0];
    if (commaThousands) raw = raw.replace(/,(?=\d{3}(?!\d))/g, "");
    else raw = raw.replace(/\.(?=\d{3}[.,])/g, ""); // 1.250,50 -> 1250,50
    const value = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(value)) values.push({ value, decimals: decimalsOf(raw), sci: /e/i.test(raw) });
  }
  return values;
}

function numbersMatch(student, expected) {
  const diff = Math.abs(student.value - expected.value);
  const mag = Math.abs(expected.value);
  if (diff <= 1e-9 * Math.max(1, mag)) return true;
  if (expected.sci || mag >= 1e5 || (mag > 0 && mag < 1e-3)) return diff <= 0.005 * mag;
  // the same value to the memo's precision (5.35 vs 5.349)
  const tol = Math.max(0.5 * Math.pow(10, -expected.decimals), 0.001 * mag);
  if (diff <= tol) return true;
  // rounded to one decimal place fewer than the memo (5.35 -> 5.4)
  if (student.decimals >= 1 && student.decimals === expected.decimals - 1) {
    const f = Math.pow(10, student.decimals);
    return Math.abs(Math.round(expected.value * f + 1e-9) / f - student.value) < 1e-9;
  }
  return false;
}

function sameSet(studentVals, expectedVals) {
  if (studentVals.length !== expectedVals.length) return false;
  const remaining = [...studentVals];
  return expectedVals.every((e) => {
    const i = remaining.findIndex((s) => numbersMatch(s, e));
    if (i < 0) return false;
    remaining.splice(i, 1);
    return true;
  });
}

function markNumber(answer, memo) {
  const expected = extractValues(memo.accepted_answer);
  const alternatives = (memo.accepted_alternatives || []).map((a) => extractValues(a)).filter((v) => v.length);
  const readings = [extractValues(answer), extractValues(answer, { commaThousands: true })];
  const normalized = readings[0].map((v) => String(+v.value.toPrecision(12))).join("; ");
  if (!expected.length || !readings[0].length) return { verdict: "incorrect", normalized };

  for (const target of [expected, ...alternatives]) {
    for (const vals of readings) {
      if (!vals.length) continue;
      if (target.length === 1) {
        // one answer expected: the student's last value counts ("2x = 10, x = 5")
        if (numbersMatch(vals[vals.length - 1], target[0])) return { verdict: "correct", normalized };
      } else if (sameSet(vals, target)) {
        return { verdict: "correct", normalized };
      }
    }
  }
  return { verdict: "incorrect", normalized };
}

/* ------------------------------------------------------------------ expressions */
function splitTopLevel(expr, separators) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of expr) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && separators.includes(ch) && cur && !/[\^*/]$/.test(cur)) {
      out.push(cur);
      cur = ch === "-" ? "-" : "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function canonicalProduct(term) {
  const factors = [];
  let rest = term.replace(/\(([^()]*)\)(\^\d+)?/g, (_, inner, pow) => {
    factors.push(`(${canonicalSum(inner)})${pow || ""}`);
    return "";
  });
  rest = rest.replace(/\*/g, "");
  if (rest === "-") factors.push("-1");
  else if (rest) factors.push(rest);
  return factors.sort().join("*");
}

function canonicalSum(expr) {
  // "3+x" == "x+3"; "(x-3)(x+3)" == "(x+3)(x-3)"
  return splitTopLevel(expr, "+-")
    .map((t) => (t.startsWith("+") ? t.slice(1) : t))
    .map(canonicalProduct)
    .sort()
    .join("+");
}

function normalizeExpression(s) {
  let t = superscriptsToCaret(unifyChars(s).toLowerCase())
    .replace(/[×·]/g, "*")
    .replace(/\s+/g, "");
  if (t.includes("=")) t = t.slice(t.lastIndexOf("=") + 1);
  return t;
}

function markExpression(answer, memo) {
  const student = normalizeExpression(answer);
  const targets = [memo.accepted_answer, ...(memo.accepted_alternatives || [])].map(normalizeExpression).filter(Boolean);
  if (!student || !targets.length) return { verdict: "incorrect", normalized: student };
  const canonStudent = canonicalSum(student);
  if (targets.some((t) => t === student || canonicalSum(t) === canonStudent)) {
    return { verdict: "correct", normalized: student };
  }
  // An equivalent form we can't prove (expanded vs factorised, ...) -> let the student judge.
  return { verdict: "needs_self_mark", normalized: student };
}

/* ------------------------------------------------------------------ entry point */
function markAnswer(userAnswer, memo) {
  const answer = toStr(userAnswer).trim();
  if (!memo) return { verdict: "needs_self_mark", normalized: normalizeText(answer) };
  if (!answer) return { verdict: "incorrect", normalized: "" };
  switch (memo.answer_format) {
    case "letter":
      return markLetter(answer, memo);
    case "boolean":
      return markBoolean(answer, memo);
    case "number":
      return markNumber(answer, memo);
    case "expression":
      return markExpression(answer, memo);
    case "term":
      return markTerm(answer, memo);
    default:
      return { verdict: "needs_self_mark", normalized: normalizeText(answer) };
  }
}

/** Which input the UI shows for a question. Never reveals the answer. */
function answerInputFor(question, answerFormat) {
  if (Array.isArray(question.options) && question.options.length) return "choice";
  switch (answerFormat) {
    case "boolean":
      return "boolean";
    case "number":
      return question.question_type === "calculation" ? "working" : "number";
    case "expression":
    case "term":
      return "short";
    default:
      return question.question_type === "calculation" ? "working" : "long";
  }
}

module.exports = {
  markAnswer,
  answerInputFor,
  normalizeText,
  extractValues,
  levenshtein,
  _internal: { markTerm, markNumber, markExpression, markLetter, markBoolean, canonicalSum },
};
