"use strict";
/* A fake YouTube Data API v3 (fetch-level) that answers with YouTube's documented response
   shapes, built from the fake fixture videos. Records every call so tests can count quota. */
const { VIDEOS, CHANNELS } = require("./videoFixtures");

function iso(seconds) {
  if (seconds === null || seconds === undefined) return "P0D";
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return `PT${h ? h + "H" : ""}${m ? m + "M" : ""}${s || (!h && !m) ? s + "S" : ""}`;
}

function toItem(v) {
  const statistics = { viewCount: String(v.view_count) };
  if (v.like_count !== null) statistics.likeCount = String(v.like_count);
  if (v.comment_count !== null) statistics.commentCount = String(v.comment_count);
  return {
    id: v.provider_video_id,
    snippet: {
      publishedAt: v.published_at, channelId: v.channel_id, title: v.title, description: v.description,
      thumbnails: { medium: { url: `https://i.ytimg.com/vi/${v.provider_video_id}/mqdefault.jpg` } },
      channelTitle: v.channel_title, tags: v.tags.length ? v.tags : undefined,
      defaultAudioLanguage: v.default_audio_language || undefined, liveBroadcastContent: "none",
    },
    contentDetails: { duration: iso(v.duration_seconds) },
    statistics,
    status: { embeddable: v.embeddable, privacyStatus: "public" },
  };
}

function createFakeYouTube({ videos = VIDEOS, channels = CHANNELS, apiKey = "test-key" } = {}) {
  const calls = [];
  const state = { quotaExceeded: false, down: false };
  const byId = new Map(videos.map((v) => [v.provider_video_id, v]));
  const uploads = new Map(channels.map((c) => [`UU${c.provider_channel_id.slice(2)}`, c.provider_channel_id]));
  const words = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

  async function fetch(url) {
    const u = new URL(url);
    const resource = u.pathname.split("/").pop();
    calls.push({ resource, params: Object.fromEntries(u.searchParams) });
    if (state.down) throw new Error("getaddrinfo ENOTFOUND www.googleapis.com");
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (u.searchParams.get("key") !== apiKey) return reply(400, { error: { code: 400, errors: [{ reason: "keyInvalid" }] } });
    if (state.quotaExceeded) return reply(403, { error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded", domain: "youtube.quota" }] } });

    if (resource === "search") {
      const q = words(u.searchParams.get("q"));
      const max = Number(u.searchParams.get("maxResults") || 5);
      const embeddableOnly = u.searchParams.get("videoEmbeddable") === "true";
      const ranked = videos
        .filter((v) => !embeddableOnly || v.embeddable)
        .map((v) => ({ v, hits: q.filter((w) => words(`${v.title} ${v.tags.join(" ")}`).includes(w)).length }))
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits || b.v.view_count - a.v.view_count)
        .slice(0, max);
      return reply(200, { items: ranked.map((x) => ({ id: { kind: "youtube#video", videoId: x.v.provider_video_id } })) });
    }
    if (resource === "videos") {
      const ids = (u.searchParams.get("id") || "").split(",");
      return reply(200, { items: ids.map((id) => byId.get(id)).filter(Boolean).map(toItem) });
    }
    if (resource === "channels") {
      const id = u.searchParams.get("id");
      const handle = u.searchParams.get("forHandle");
      const c = channels.find((x) => x.provider_channel_id === id || x.handle === handle);
      return reply(200, { items: c ? [{ id: c.provider_channel_id, snippet: { title: c.title, customUrl: c.handle }, contentDetails: { relatedPlaylists: { uploads: `UU${c.provider_channel_id.slice(2)}` } } }] : [] });
    }
    if (resource === "playlistItems") {
      const channelId = uploads.get(u.searchParams.get("playlistId"));
      const all = videos.filter((v) => v.channel_id === channelId);
      const start = Number(u.searchParams.get("pageToken") || 0);
      const page = all.slice(start, start + 50);
      return reply(200, {
        items: page.map((v) => ({ contentDetails: { videoId: v.provider_video_id } })),
        nextPageToken: start + 50 < all.length ? String(start + 50) : undefined,
      });
    }
    return reply(404, { error: { code: 404, errors: [{ reason: "notFound" }] } });
  }

  const count = (resource) => calls.filter((c) => c.resource === resource).length;
  return { fetch, calls, state, count, apiKey };
}

module.exports = { createFakeYouTube, iso, toItem };
