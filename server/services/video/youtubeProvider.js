/**
 * YouTube Data API v3 provider (server-side only; the key never reaches the browser).
 *
 * Every provider exposes the same shape so others (Vimeo, Khan Academy...) can be added later:
 *   name, search(params) -> [videoId], getVideos(ids) -> [Video], getChannel({id|handle}),
 *   listUploads(playlistId, {max}) -> [videoId]
 *
 * Quota (charged BEFORE each call through `quota.charge`): search.list 100 units, other reads 1 unit.
 */
"use strict";

const BASE_URL = "https://www.googleapis.com/youtube/v3";
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

class ProviderError extends Error {
  constructor(message, { code = "provider_error", status } = {}) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
class QuotaExceededError extends ProviderError {
  constructor(message = "Daily YouTube quota reached") {
    super(message, { code: "quota_exceeded" });
  }
}

/** ISO 8601 durations as YouTube returns them: "PT1H2M3S", "PT45S", "P1DT2H" -> seconds. */
function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso || ""));
  if (!m) return null;
  const [, d = 0, h = 0, min = 0, sec = 0] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(sec);
}

const toCount = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

/** YouTube resource -> SkillForge's common Video shape (as stored in vd_videos). */
function normalizeVideo(item, now = new Date()) {
  const sn = item.snippet || {};
  const st = item.statistics || {};
  const cd = item.contentDetails || {};
  const status = item.status || {};
  const thumbs = sn.thumbnails || {};
  const thumb = thumbs.medium || thumbs.high || thumbs.default || null;
  return {
    provider: "youtube",
    provider_video_id: item.id,
    channel_id: sn.channelId || "",
    channel_title: sn.channelTitle || null,
    title: sn.title || "",
    description: String(sn.description || "").slice(0, 5000),
    tags: Array.isArray(sn.tags) ? sn.tags.slice(0, 40) : [],
    thumbnail_url: thumb ? thumb.url : null,
    published_at: sn.publishedAt || null,
    duration_seconds: parseDuration(cd.duration),
    view_count: toCount(st.viewCount),
    like_count: toCount(st.likeCount), // absent when the creator hides likes: stays null, never 0
    comment_count: toCount(st.commentCount), // absent when comments are off
    default_language: sn.defaultLanguage || null,
    default_audio_language: sn.defaultAudioLanguage || null,
    embeddable: status.embeddable !== false,
    privacy_status: status.privacyStatus || null,
    live_broadcast_content: sn.liveBroadcastContent || null,
    fetched_at: now.toISOString(),
  };
}

function createYouTubeProvider({ apiKey, quota, fetch: fetchImpl = globalThis.fetch, baseUrl = BASE_URL, config = {}, now = () => new Date() } = {}) {
  if (!apiKey) throw new ProviderError("YOUTUBE_API_KEY is not set", { code: "not_configured" });
  if (!quota || typeof quota.charge !== "function") throw new ProviderError("a quota ledger is required", { code: "not_configured" });
  const yt = { regionCode: "ZA", safeSearch: "strict", maxResults: 25, ...config.youtube };
  const units = { search: 100, read: 1, ...(config.quota ? { search: config.quota.searchUnits, read: config.quota.readUnits } : {}) };

  async function call(resource, params, { searchCalls = 0, cost }) {
    const allowed = await quota.charge({ searchCalls, units: cost });
    if (!allowed) throw new QuotaExceededError("SkillForge's daily YouTube budget is used up");
    const url = new URL(`${baseUrl}/${resource}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    url.searchParams.set("key", apiKey);
    let res;
    try {
      res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      throw new ProviderError(`YouTube could not be reached (${err.message})`, { code: "unavailable" });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reasons = ((body.error && body.error.errors) || []).map((e) => e.reason);
      if (res.status === 403 && reasons.some((r) => /quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(r))) {
        throw new QuotaExceededError("YouTube reports the daily quota is used up");
      }
      if (res.status === 400 && reasons.includes("keyInvalid")) throw new ProviderError("The YouTube API key is invalid", { code: "not_configured", status: 400 });
      if (res.status === 403 && reasons.some((r) => /accessNotConfigured|forbidden|ipRefererBlocked/.test(r))) {
        throw new ProviderError("The YouTube Data API is not enabled for this key", { code: "not_configured", status: 403 });
      }
      // never echo the request URL: it contains the key
      throw new ProviderError(`YouTube returned ${res.status}${reasons.length ? ` (${reasons.join(", ")})` : ""}`, { status: res.status });
    }
    return body;
  }

  return {
    name: "youtube",

    /** search.list for embeddable, safe, public videos. Returns video IDs in YouTube's order. */
    async search({ q, maxResults = yt.maxResults, relevanceLanguage, videoDuration } = {}) {
      if (!q || !String(q).trim()) return [];
      const body = await call(
        "search",
        {
          part: "snippet",
          type: "video",
          q: String(q).slice(0, 200),
          maxResults: Math.min(50, Math.max(1, maxResults)),
          videoEmbeddable: "true",
          safeSearch: yt.safeSearch,
          regionCode: yt.regionCode,
          relevanceLanguage: /^[a-z]{2}$/.test(relevanceLanguage || "") ? relevanceLanguage : undefined,
          videoDuration: ["short", "medium", "long"].includes(videoDuration) ? videoDuration : undefined,
          fields: "items(id/videoId)",
        },
        { searchCalls: 1, cost: units.search }
      );
      return (body.items || []).map((it) => it.id && it.id.videoId).filter((id) => VIDEO_ID_RE.test(id || ""));
    },

    /** videos.list in batches of 50 (1 unit each): full metadata + statistics + status. */
    async getVideos(ids) {
      const unique = [...new Set((ids || []).filter((id) => VIDEO_ID_RE.test(id)))];
      const out = [];
      for (let i = 0; i < unique.length; i += 50) {
        const body = await call(
          "videos",
          {
            part: "snippet,contentDetails,statistics,status",
            id: unique.slice(i, i + 50).join(","),
            maxResults: 50,
            fields:
              "items(id,snippet(publishedAt,channelId,title,description,thumbnails,channelTitle,tags,defaultLanguage,defaultAudioLanguage,liveBroadcastContent)," +
              "contentDetails(duration),statistics(viewCount,likeCount,commentCount),status(embeddable,privacyStatus))",
          },
          { cost: units.read }
        );
        const at = now();
        for (const item of body.items || []) out.push(normalizeVideo(item, at));
      }
      return out;
    },

    /** channels.list by channel ID or @handle (1 unit). */
    async getChannel({ id, handle } = {}) {
      const params = { part: "snippet,contentDetails", fields: "items(id,snippet(title,customUrl),contentDetails(relatedPlaylists(uploads)))" };
      if (id) params.id = id;
      else if (handle) params.forHandle = handle.startsWith("@") ? handle : `@${handle}`;
      else throw new ProviderError("channel id or handle required", { code: "bad_request" });
      const body = await call("channels", params, { cost: units.read });
      const item = (body.items || [])[0];
      if (!item) return null;
      return {
        provider_channel_id: item.id,
        title: (item.snippet && item.snippet.title) || null,
        handle: (item.snippet && item.snippet.customUrl) || handle || null,
        uploads_playlist_id: item.contentDetails && item.contentDetails.relatedPlaylists && item.contentDetails.relatedPlaylists.uploads,
      };
    },

    /** playlistItems.list over a channel's uploads playlist (1 unit per 50 videos). */
    async listUploads(playlistId, { max = 200 } = {}) {
      const ids = [];
      let pageToken;
      do {
        const body = await call(
          "playlistItems",
          { part: "contentDetails", playlistId, maxResults: 50, pageToken, fields: "nextPageToken,items(contentDetails(videoId))" },
          { cost: units.read }
        );
        for (const it of body.items || []) {
          const vid = it.contentDetails && it.contentDetails.videoId;
          if (VIDEO_ID_RE.test(vid || "")) ids.push(vid);
        }
        pageToken = body.nextPageToken;
      } while (pageToken && ids.length < max);
      return ids.slice(0, max);
    },
  };
}

module.exports = { createYouTubeProvider, normalizeVideo, parseDuration, ProviderError, QuotaExceededError, VIDEO_ID_RE };
