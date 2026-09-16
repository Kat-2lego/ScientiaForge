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

/**
 * Fetch skills for an occupation using ESCO's explicit essential/optional skill relations.
 * Falls back to search-based method if the concept call fails.
 */
export async function getOccupationSkills(escoUri, language = "en", options = {}) {
  const {
    maxSkills = 35,
    fetchLimit = 80,
  } = options;

  try {
    // --- PRIMARY: explicit relations (Option B) ---
    const conceptUrl = new URL(`${ESCO_BASE_URL}/resource`);
    conceptUrl.searchParams.set("uri", escoUri);

    const conceptRes = await fetch(conceptUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SkillForge/1.0",
      },
    });

    if (!conceptRes.ok) {
      throw new Error(
        `ESCO concept request failed: ${conceptRes.status}. ` +
        `Body: ${(await conceptRes.text().catch(() => "")).slice(0, 200)}`
      );
    }

    const concept = await conceptRes.json();

    const occupationTitle =
      concept.preferredLabel?.[language] ||
      concept.preferredLabel?.en ||
      concept.title ||
      "worker";

    console.log(
      `[Option B] Fetching skills for occupation: "${occupationTitle}" (${escoUri})`
    );

    // Extract skill URIs from essentialSkill / optionalSkill
    const skillUris = new Set();

    function collectSkillUris(field) {
      const node = concept[field];
      if (!node) return;

      const arr = Array.isArray(node) ? node : [node];
      for (const item of arr) {
        const uri = item["@id"] || item.uri;
        if (typeof uri === "string" && uri.startsWith("http://data.europa.eu/esco/skill/")) {
          skillUris.add(uri);
        }
      }
    }

    collectSkillUris("http://data.europa.eu/esco/essentialSkill");
    collectSkillUris("http://data.europa.eu/esco/optionalSkill");

    if (skillUris.size === 0) {
      collectSkillUris("http://data.europa.eu/esco/hasSkill");
    }

    console.log(
      `[Option B] Found ${skillUris.size} explicit skill URIs for "${occupationTitle}"`
    );

    if (skillUris.size === 0) {
      // No explicit skills; fall back to search
      throw new Error("No explicit skills found; using fallback");
    }

    // Fetch skill concepts (batched)
    const skillUriList = [...skillUris].slice(0, fetchLimit);

    const skillPromises = skillUriList.map(async (uri) => {
      const url = new URL(`${ESCO_BASE_URL}/resource`);
      url.searchParams.set("uri", uri);

      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "SkillForge/1.0",
          },
        });

        if (!res.ok) return null;

        const data = await res.json();
        const label =
          data.preferredLabel?.[language] ||
          data.preferredLabel?.en ||
          data.title ||
          data.label ||
          "Skill";

        return label;
      } catch {
        return null;
      }
    });

    const skillLabelsRaw = (await Promise.all(skillPromises)).filter(Boolean);

    console.log(
      `[Option B] Fetched ${skillLabelsRaw.length} skill labels for "${occupationTitle}"`
    );

    // Filter out obviously irrelevant skills
    const { isObviouslyIrrelevant } = await import("./skillRelevance.mjs");

    const filtered = skillLabelsRaw.filter(
      (label) => !isObviouslyIrrelevant(label)
    );

    console.log(
      `[Option B] After irrelevance filter: ${filtered.length} skills for "${occupationTitle}"`
    );

    const result = filtered.slice(0, maxSkills);

    console.log(
      `[Option B] Returning ${result.length} skills for "${occupationTitle}"`
    );

    if (result.length > 0) {
      return result;
    }

    // If filtered list is empty, fall back to search
    throw new Error("Explicit skills filtered to empty; using fallback");

  } catch (err) {
    // --- FALLBACK: search-based method (Option A) ---
    console.warn(
      `[Option B] Failed for ${escoUri}: ${err.message}. Falling back to search-based skills.`
    );
    return getOccupationSkillsViaSearch(escoUri, language, { maxSkills, fetchLimit });
  }
}

/**
 * Fallback: fetch skills via ESCO search (Option A).
 */
async function getOccupationSkillsViaSearch(escoUri, language = "en", options = {}) {
  const {
    maxSkills = 35,
    fetchLimit = 100,
  } = options;

  // Fetch occupation concept to get title and ISCO
  const conceptUrl = new URL(`${ESCO_BASE_URL}/resource`);
  conceptUrl.searchParams.set("uri", escoUri);

  const conceptRes = await fetch(conceptUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SkillForge/1.0",
    },
  });

  if (!conceptRes.ok) {
    const text = await conceptRes.text().catch(() => "");
    throw new Error(
      `ESCO concept request failed: ${conceptRes.status}. ` +
      `Body: ${text.slice(0, 200)}`
    );
  }

  const concept = await conceptRes.json();

  const iscoCode = extractIscoCode(concept);

  if (!iscoCode) {
    console.warn("No ISCO code found for occupation:", escoUri);
    return [];
  }

  const occupationTitle =
    concept.preferredLabel?.[language] ||
    concept.preferredLabel?.en ||
    concept.title ||
    "worker";

  const skillsUrl = new URL(`${ESCO_BASE_URL}/search`);

  skillsUrl.searchParams.set("type", "skill");
  skillsUrl.searchParams.set("language", language);
  skillsUrl.searchParams.set("limit", String(fetchLimit));
  skillsUrl.searchParams.set("text", occupationTitle);
  skillsUrl.searchParams.set("isco", iscoCode);

  console.log(
    `[Option A] ESCO skills search: text="${occupationTitle}", isco=${iscoCode}, limit=${fetchLimit}`
  );

  const skillsRes = await fetch(skillsUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "SkillForge/1.0",
    },
  });

  if (!skillsRes.ok) {
    const text = await skillsRes.text().catch(() => "");
    throw new Error(
      `ESCO skills search failed: ${skillsRes.status}. ` +
      `Body: ${text.slice(0, 200)}`
    );
  }

  const skillsData = await skillsRes.json();
  const results = skillsData?._embedded?.results || [];

  console.log(
    `[Option A] ESCO skills search returned ${results.length} raw skills for ISCO ${iscoCode} ("${occupationTitle}")`
  );

  let allSkills = results.map((s) => {
    const label =
      s.preferredLabel?.[language] ||
      s.preferredLabel?.en ||
      s.title ||
      s.label ||
      "Skill";
    return label;
  });

  const { isObviouslyIrrelevant } = await import("./skillRelevance.mjs");

  const filtered = allSkills.filter(
    (label) => !isObviouslyIrrelevant(label)
  );

  console.log(
    `[Option A] After irrelevance filter: ${filtered.length} skills for "${occupationTitle}"`
  );

  return filtered.slice(0, maxSkills);
}