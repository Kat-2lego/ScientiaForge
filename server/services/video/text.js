/** Text normalisation and phrase matching for ranking. No AI: plain, testable rules. */
"use strict";

const STOPWORDS = new Set(
  ("a an and are as at be by can do does for from how i in into is it its me my of on or so that the this to " +
    "was what when where which who why will with you your about help need want dont don t understand learn " +
    "please video videos explain").split(" ")
);

const cache = new Map();

function normalize(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "identities" -> "identity", "equations" -> "equation"; leaves short words and "ss" alone. */
function stem(word) {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
    return word.slice(0, -1);
  }
  return word;
}

function tokens(text, { dropStopwords = true } = {}) {
  return normalize(text)
    .split(" ")
    .filter((t) => t && (!dropStopwords || !STOPWORDS.has(t)))
    .map(stem);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex for a phrase on normalised text: word boundaries, plural-tolerant on every word. */
function phraseRegex(phrase) {
  const key = phrase;
  if (cache.has(key)) return cache.get(key);
  const words = normalize(phrase).split(" ").filter(Boolean).map(stem);
  const re = words.length
    ? new RegExp(`(?:^|\\s)${words.map((w) => `${escapeRe(w)}(?:s|es)?`).join("\\s+")}(?=\\s|$)`)
    : null;
  cache.set(key, re);
  return re;
}

/** Normalised text with each word stemmed, so "identities" matches "identity". */
function stemmedText(text) {
  return normalize(text).split(" ").filter(Boolean).map(stem).join(" ");
}

function hasPhrase(stemmed, phrase) {
  const re = phraseRegex(phrase);
  return re ? re.test(stemmed) : false;
}

module.exports = { normalize, stem, tokens, phraseRegex, stemmedText, hasPhrase, STOPWORDS };
