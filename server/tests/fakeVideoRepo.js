"use strict";
/* In-memory stand-in for videoRepo with the same behaviour as the SQL (30-day reads,
   atomic quota, unique saves/feedback/history). */
function createMemoryVideoRepo({ channels = [], now = () => new Date(), maxAgeDays = 30 } = {}) {
  const db = { cache: new Map(), videos: new Map(), channels: new Map(channels.map((c) => [c.provider_channel_id, { ...c }])), flags: new Map(),
    feedback: new Map(), saved: new Map(), history: new Map(), usage: { search_calls: 0, units: 0 } };
  const fresh = (r) => (now() - new Date(r.fetched_at)) / 86400000 <= maxAgeDays;
  const key = (u, id) => `${u}|${id}`;
  return {
    db,
    async getSearchCache(k) { const r = db.cache.get(k); return r && new Date(r.expires_at) > now() ? r : null; },
    async putSearchCache(r) { db.cache.set(r.cache_key, { ...r }); },
    async getVideos(ids) { return ids.map((id) => db.videos.get(id)).filter((r) => r && fresh(r)); },
    async upsertVideos(rows) { for (const r of rows) db.videos.set(r.provider_video_id, { ...r }); },
    async getChannelVideos(ids, { limit = 400 } = {}) {
      return [...db.videos.values()].filter((v) => ids.includes(v.channel_id) && fresh(v))
        .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).slice(0, limit);
    },
    async staleVideoIds({ olderThanDays }) { return [...db.videos.values()].filter((v) => (now() - new Date(v.fetched_at)) / 86400000 > olderThanDays).map((v) => v.provider_video_id); },
    async purgeStale(days) { let n = 0; for (const [id, v] of db.videos) if ((now() - new Date(v.fetched_at)) / 86400000 > days) { db.videos.delete(id); n++; } return { videos: n }; },
    async listChannels() { return [...db.channels.values()]; },
    async upsertChannel(r) { const row = { ...(db.channels.get(r.provider_channel_id) || {}), ...r }; db.channels.set(r.provider_channel_id, row); return row; },
    async updateChannel(id, patch) { Object.assign(db.channels.get(id), patch); },
    async getFlags(ids) { return new Map(ids.filter((id) => db.flags.has(id)).map((id) => [id, db.flags.get(id)])); },
    async verifiedIds(subject) { return [...db.flags.values()].filter((f) => f.status === "verified" && (!subject || f.subject === subject)).map((f) => f.provider_video_id); },
    async setFlag(r) { db.flags.set(r.provider_video_id, { ...r }); },
    async removeFlag(id) { db.flags.delete(id); },
    async feedbackStats(ids) {
      const out = new Map();
      for (const f of db.feedback.values()) {
        if (!ids.includes(f.provider_video_id)) continue;
        const s = out.get(f.provider_video_id) || { up: 0, down: 0 };
        f.useful ? s.up++ : s.down++;
        out.set(f.provider_video_id, s);
      }
      return out;
    },
    async upsertFeedback(r) { db.feedback.set(key(r.user_id, r.provider_video_id), { ...r }); },
    async userStates(userId, ids) {
      return {
        saved: new Set(ids.filter((id) => db.saved.has(key(userId, id)))),
        feedback: new Map(ids.filter((id) => db.feedback.has(key(userId, id))).map((id) => [id, { useful: db.feedback.get(key(userId, id)).useful, reason: db.feedback.get(key(userId, id)).reason }])),
      };
    },
    async saveVideo(r) { db.saved.set(key(r.user_id, r.provider_video_id), { ...r, created_at: now().toISOString() }); },
    async unsaveVideo(u, id) { db.saved.delete(key(u, id)); },
    async listSaved(u) { return [...db.saved.values()].filter((r) => r.user_id === u).reverse(); },
    async recordHistory(r) { db.history.delete(key(r.user_id, r.provider_video_id)); db.history.set(key(r.user_id, r.provider_video_id), { ...r, watched_at: now().toISOString() }); },
    async listHistory(u, { limit = 50 } = {}) { return [...db.history.values()].filter((r) => r.user_id === u).reverse().slice(0, limit); },
    async clearHistory(u, id) { for (const k of [...db.history.keys()]) if (k.startsWith(`${u}|`) && (!id || k.endsWith(`|${id}`))) db.history.delete(k); },
    async referencedIds(ids) {
      const refs = new Set();
      for (const r of [...db.saved.values(), ...db.history.values()]) if (ids.includes(r.provider_video_id)) refs.add(r.provider_video_id);
      for (const f of db.flags.values()) if (f.status === "verified" && ids.includes(f.provider_video_id)) refs.add(f.provider_video_id);
      return refs;
    },
    async chargeQuota({ searchCalls = 0, units = 0 }, limits) {
      if (db.usage.search_calls + searchCalls > limits.maxSearchCallsPerDay || db.usage.units + units > limits.maxUnitsPerDay) return false;
      db.usage.search_calls += searchCalls; db.usage.units += units; return true;
    },
    async quotaToday() { return { usage_date: "today", ...db.usage }; },
  };
}
module.exports = { createMemoryVideoRepo };
