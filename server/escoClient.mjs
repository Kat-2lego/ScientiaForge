// server/escoClient.mjs

const ESCO_BASE_URL = "https://ec.europa.eu/esco/api";

export async function searchEscoOccupations(searchText) {
  const url = new URL(`${ESCO_BASE_URL}/search`);

  url.searchParams.set("text", searchText);
  url.searchParams.set("type", "occupation");
  url.searchParams.set("language", "en");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SkillForge/1.0",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ESCO occupation search failed: ${response.status}. ` +
      `Body: ${text.slice(0, 200)}`
    );
  }

  const data = await response.json();
  const results = data?._embedded?.results || [];

  return results.map((item) => ({
    escoUri: item.uri,
    title: item.title || item.label || "Unnamed occupation",
    iscoCode: extractIscoCode(item),
  }));
}

export function extractIscoCode(concept) {
  if (typeof concept.code === "string" && /^\d/.test(concept.code)) {
    const match = concept.code.match(/^(\d{4})/);
    if (match) return match[1];
    return concept.code.slice(0, 4);
  }

  if (Array.isArray(concept.codes) && concept.codes.length > 0) {
    const firstCode =
      concept.codes[0].value ||
      concept.codes[0].code ||
      concept.codes[0];

    if (typeof firstCode === "string" && /^\d/.test(firstCode)) {
      const match = firstCode.match(/^(\d{4})/);
      if (match) return match[1];
      return firstCode.slice(0, 4);
    }
  }

  return null;
}

// Essential-only occupation profiles.
// In-memory caches reset when the server restarts.

const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PROFILE_CACHE_ENTRIES = 500;

const essentialProfileCache = new Map();
const pendingEssentialProfiles = new Map();

function makeEscoError(message, code = "ESCO_PROFILE_UNAVAILABLE") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateOccupationUri(uri) {
  if (
    typeof uri !== "string" ||
    !/^https?:\/\/data\.europa\.eu\/esco\/occupation\/[0-9a-f-]+$/i.test(uri)
  ) {
    throw makeEscoError(
      "Invalid ESCO occupation URI.",
      "INVALID_ESCO_OCCUPATION"
    );
  }
}

function getLabel(resource, language) {
  const preferred = resource?.preferredLabel;

  const candidates = [
    resource?.title,
    typeof preferred === "string" ? preferred : preferred?.[language],
    typeof preferred === "object" ? preferred?.en : null,
    resource?.label,
  ];

  return candidates.find(
    (value) => typeof value === "string" && value.trim()
  )?.trim() || null;
}

function getSkillUri(link) {
  const directUri = link?.uri || link?.["@id"];

  if (
    typeof directUri === "string" &&
    /^https?:\/\/data\.europa\.eu\/esco\/skill\//i.test(directUri)
  ) {
    return directUri;
  }

  // Some links expose the concept identifier only inside their API URL.
  if (typeof link?.href === "string") {
    try {
      const href = new URL(link.href, `${ESCO_BASE_URL}/`);
      const uri = href.searchParams.get("uri");

      if (
        uri &&
        /^https?:\/\/data\.europa\.eu\/esco\/skill\//i.test(uri)
      ) {
        return uri;
      }
    } catch {
      // Invalid links are rejected below.
    }
  }

  return null;
}

async function fetchEscoResource(type, uri, language) {
  const url = new URL(`${ESCO_BASE_URL}/resource/${type}`);
  url.searchParams.set("uri", uri);
  url.searchParams.set("language", language);

  // One retry for network failures, rate limiting and server failures.
  for (let attempt = 0; attempt < 2; attempt++) {
    let retryable = true;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "SkillForge/1.0",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        retryable = response.status === 429 || response.status >= 500;

        throw makeEscoError(
          `ESCO ${type} request failed with status ${response.status}.`
        );
      }

      return await response.json();
    } catch (error) {
      if (!retryable || attempt === 1) {
        throw makeEscoError(
          `Could not load ESCO ${type}: ${error.message}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
}

async function resolveEssentialSkills(links, language) {
  const results = new Array(links.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < links.length) {
      const index = nextIndex++;
      const link = links[index];
      const uri = getSkillUri(link);

      if (!uri) {
        throw makeEscoError(
          "An essential skill relationship has no valid ESCO skill URI."
        );
      }

      // Usually the relationship already supplies a usable label.
      let label = getLabel(link, language);

      if (!label) {
        const resource = await fetchEscoResource("skill", uri, language);
        label = getLabel(resource, language);
      }

      if (!label) {
        throw makeEscoError(
          `No label could be resolved for essential skill ${uri}.`
        );
      }

      results[index] = {
        uri,
        label,
        importance: "essential",
      };
    }
  }

  // Resolve missing labels with at most four concurrent requests.
  const workers = await Promise.allSettled(
    Array.from(
      { length: Math.min(4, links.length) },
      () => worker()
    )
  );

  const failure = workers.find((result) => result.status === "rejected");

  if (failure) {
    throw failure.reason;
  }

  // Deduplicate by ESCO identifier, not by similar wording.
  return [...new Map(results.map((skill) => [skill.uri, skill])).values()];
}

async function fetchEssentialProfile(occupationUri, language) {
  const occupation = await fetchEscoResource(
    "occupation",
    occupationUri,
    language
  );

  const rawLinks = occupation?._links?.hasEssentialSkill;

  if (rawLinks == null) {
    console.error("[ESCO] Essential relationship field missing", {
      occupationUri,
      topLevelKeys: Object.keys(occupation || {}),
      linkKeys: Object.keys(occupation?._links || {}),
    });

    throw makeEscoError(
      "ESCO did not return a readable essential-skill relationship field."
    );
  }

  const links = Array.isArray(rawLinks) ? rawLinks : [rawLinks];

  if (links.length === 0) {
    throw makeEscoError(
      "No essential skills were returned for this occupation."
    );
  }

  const skills = await resolveEssentialSkills(links, language);

  const profile = {
    occupationUri,
    occupationTitle: getLabel(occupation, language),
    language,
    source: "ESCO",
    skillScope: "essential",
    fetchedAt: new Date().toISOString(),
    skills,
  };

  console.log("[ESCO] Essential profile loaded", {
    occupation: profile.occupationTitle,
    occupationUri,
    essentialSkills: skills.length,
  });

  return profile;
}

// New structured API for future roadmap mappings.
export async function getOccupationEssentialProfile(
  occupationUri,
  language = "en"
) {
  validateOccupationUri(occupationUri);

  const key = `${language}:${occupationUri}`;
  const cached = essentialProfileCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    console.log("[ESCO] Essential profile cache hit:", occupationUri);
    return cached.profile;
  }

  if (cached) {
    essentialProfileCache.delete(key);
  }

  if (pendingEssentialProfiles.has(key)) {
    return pendingEssentialProfiles.get(key);
  }

  const pending = fetchEssentialProfile(occupationUri, language)
    .then((profile) => {
      if (essentialProfileCache.size >= MAX_PROFILE_CACHE_ENTRIES) {
        const oldestKey = essentialProfileCache.keys().next().value;
        essentialProfileCache.delete(oldestKey);
      }

      essentialProfileCache.set(key, {
        profile,
        expiresAt: Date.now() + PROFILE_TTL_MS,
      });

      return profile;
    })
    .finally(() => {
      pendingEssentialProfiles.delete(key);
    });

  pendingEssentialProfiles.set(key, pending);
  return pending;
}

// Compatibility wrapper: existing matcher/UI still receive string[].
export async function getOccupationSkills(occupationUri, language = "en") {
  const profile = await getOccupationEssentialProfile(
    occupationUri,
    language
  );

  return profile.skills.map((skill) => skill.label);
}