// Best-effort fetch of a job posting URL for the Application Command Centre.
// Tries schema.org JobPosting structured data first (most reliable), falls
// back to the page's visible text. No new npm dependency: both extraction
// steps are deliberately simple regex work rather than a full HTML parser,
// which is enough for "get readable text to hand to Gemini" without adding
// cheerio/jsdom to the project for one feature.
//
// This fetches a URL the user supplies, so it's a classic SSRF surface -
// blocked here at a sensible baseline (reject localhost/private-looking
// hosts, cap the timeout and response size, don't follow more than a
// handful of redirects). This is not exhaustive DNS-rebinding protection;
// it's the same level of caution reasonable for a student project talking
// to public job-board URLs, not a hardened production fetcher.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024; // 3MB is generous for an HTML page
const MAX_TEXT_CHARS = 12_000; // kept well under Gemini's prompt budget
const USER_AGENT =
  "Mozilla/5.0 (compatible; SkillForgeApplicationBot/1.0; +https://skillforge.app)";

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./, // link-local, incl. cloud metadata endpoints
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
];

class JobLinkError extends Error {
  constructor(message) {
    super(message);
    this.name = "JobLinkError";
  }
}

function assertFetchableUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new JobLinkError("That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new JobLinkError("Only http and https links are supported.");
  }

  if (BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) {
    throw new JobLinkError("That link can't be read.");
  }

  return parsed;
}

function extractJsonLdJobPosting(html) {
  const blocks = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  if (!blocks) return null;

  for (const block of blocks) {
    const inner = block.replace(/^[^>]*>/, "").replace(/<\/script>\s*$/i, "");
    let parsed;
    try {
      parsed = JSON.parse(inner);
    } catch {
      continue; // malformed JSON-LD is common enough to just skip, not fail on
    }

    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of candidates) {
      const graph = Array.isArray(candidate?.["@graph"]) ? candidate["@graph"] : [candidate];
      const jobPosting = graph.find((node) => {
        const type = node?.["@type"];
        return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      });
      if (jobPosting) return jobPosting;
    }
  }

  return null;
}

function stripHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function jobPostingToText(jobPosting) {
  const parts = [];
  if (jobPosting.title) parts.push(`Job title: ${jobPosting.title}`);
  const org = jobPosting.hiringOrganization;
  const orgName = typeof org === "string" ? org : org?.name;
  if (orgName) parts.push(`Company: ${orgName}`);
  if (jobPosting.validThrough) parts.push(`Application deadline: ${jobPosting.validThrough}`);
  const loc = jobPosting.jobLocation;
  const locName =
    typeof loc === "string"
      ? loc
      : loc?.address?.addressLocality || loc?.address?.addressRegion;
  if (locName) parts.push(`Location: ${locName}`);
  if (jobPosting.employmentType) parts.push(`Employment type: ${jobPosting.employmentType}`);
  if (jobPosting.description) {
    parts.push(`Description:\n${stripHtmlToText(String(jobPosting.description))}`);
  }
  return parts.join("\n");
}

/**
 * Fetch a job posting URL and return readable text for the Gemini prompt.
 * Throws JobLinkError (safe to show the message to the user) on anything
 * that should surface as "We couldn't read that link, please paste the job
 * description instead."
 */
export async function fetchJobPostingText(rawUrl) {
  const url = assertFetchableUrl(rawUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new JobLinkError("That link took too long to load.");
    }
    throw new JobLinkError("We couldn't reach that link.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new JobLinkError(`We couldn't read that link (status ${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
    throw new JobLinkError("That link doesn't point to a readable web page.");
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength && contentLength > MAX_RESPONSE_BYTES) {
    throw new JobLinkError("That page is too large to read.");
  }

  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) {
    throw new JobLinkError("That page is too large to read.");
  }

  const jobPosting = extractJsonLdJobPosting(html);
  const text = jobPosting ? jobPostingToText(jobPosting) : stripHtmlToText(html);

  if (!text || text.trim().length < 150) {
    throw new JobLinkError(
      "We couldn't find enough job description text on that page."
    );
  }

  return {
    text: text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text,
    fromStructuredData: !!jobPosting,
  };
}

export { JobLinkError };
