/**
 * Video Discovery data access (Supabase, service-role client).
 * YouTube data is only ever read if it was fetched within cache.maxAgeDays (30).
 */
"use strict";

function check({ data, error }) {
  if (error) {
    const err = new Error(error.message || "Database error");
    err.code = error.code;
    throw err;
  }
  return data;
}

const VIDEO_COLUMNS =
  "provider, provider_video_id, channel_id, channel_title, title, description, tags, thumbnail_url, published_at, " +
  "duration_seconds, view_count, like_count, comment_count, default_language, default_audio_language, embeddable, " +
  "privacy_status, live_broadcast_content, fetched_at";

function createVideoRepo(supabase, { now = () => new Date(), maxAgeDays = 30 } = {}) {
  const cutoff = (days = maxAgeDays) => new Date(now().getTime() - days * 86400000).toISOString();
  const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

  return {
    /* ---------------------------------------------------------- search cache */
    async getSearchCache(cacheKey) {
      const row = check(
        await supabase.from("vd_search_cache").select("cache_key, video_ids, fetched_at, expires_at").eq("cache_key", cacheKey).maybeSingle()
      );
      return row && new Date(row.expires_at) > now() && row.fetched_at >= cutoff() ? row : null;
    },
    async putSearchCache(row) {
      check(await supabase.from("vd_search_cache").upsert({ provider: "youtube", ...row }, { onConflict: "cache_key" }));
    },

    /* ---------------------------------------------------------- video cache */
    async getVideos(ids) {
      const out = [];
      for (const part of chunks([...new Set(ids)], 150)) {
        if (!part.length) continue;
        out.push(...(check(await supabase.from("vd_videos").select(VIDEO_COLUMNS).in("provider_video_id", part).gte("fetched_at", cutoff())) || []));
      }
      return out;
    },
    async upsertVideos(rows) {
      for (const part of chunks(rows, 200)) {
        if (part.length) check(await supabase.from("vd_videos").upsert(part, { onConflict: "provider,provider_video_id" }));
      }
    },
    async getChannelVideos(channelIds, { limit = 400 } = {}) {
      if (!channelIds.length) return [];
      return check(
        await supabase.from("vd_videos").select(VIDEO_COLUMNS).in("channel_id", channelIds).gte("fetched_at", cutoff())
          .order("published_at", { ascending: false }).limit(limit)
      ) || [];
    },
    async staleVideoIds({ olderThanDays, limit = 1000 }) {
      const rows = check(await supabase.from("vd_videos").select("provider_video_id").lt("fetched_at", cutoff(olderThanDays)).limit(limit)) || [];
      return rows.map((r) => r.provider_video_id);
    },
    async purgeStale(days = maxAgeDays) {
      return check(await supabase.rpc("vd_purge_stale", { p_max_age_days: days }));
    },

    /* ---------------------------------------------------------- channels + flags */
    async listChannels() {
      return check(await supabase.from("vd_channels").select("*").order("id", { ascending: true })) || [];
    },
    async upsertChannel(row) {
      return check(await supabase.from("vd_channels").upsert(row, { onConflict: "provider,provider_channel_id" }).select("*").single());
    },
    async updateChannel(providerChannelId, patch) {
      check(await supabase.from("vd_channels").update(patch).eq("provider_channel_id", providerChannelId));
    },
    async getFlags(ids) {
      if (!ids.length) return new Map();
      const out = new Map();
      for (const part of chunks([...new Set(ids)], 150)) {
        for (const r of check(await supabase.from("vd_video_flags").select("provider_video_id, status, subject, topic").in("provider_video_id", part)) || []) {
          out.set(r.provider_video_id, r);
        }
      }
      return out;
    },
    async verifiedIds(subject) {
      let q = supabase.from("vd_video_flags").select("provider_video_id").eq("status", "verified");
      if (subject) q = q.eq("subject", subject);
      return (check(await q.limit(300)) || []).map((r) => r.provider_video_id);
    },
    async setFlag(row) {
      check(await supabase.from("vd_video_flags").upsert({ provider: "youtube", ...row }, { onConflict: "provider,provider_video_id" }));
    },
    async removeFlag(videoId) {
      check(await supabase.from("vd_video_flags").delete().eq("provider_video_id", videoId));
    },

    /* ---------------------------------------------------------- learner data */
    async feedbackStats(ids) {
      if (!ids.length) return new Map();
      const rows = check(await supabase.rpc("vd_feedback_stats", { p_video_ids: [...new Set(ids)] })) || [];
      return new Map(rows.map((r) => [r.provider_video_id, { up: r.useful_votes, down: r.not_useful_votes }]));
    },
    async upsertFeedback(row) {
      check(await supabase.from("vd_feedback").upsert({ provider: "youtube", ...row }, { onConflict: "user_id,provider,provider_video_id" }));
    },
    async userStates(userId, ids) {
      if (!userId || !ids.length) return { saved: new Set(), feedback: new Map() };
      const [saved, feedback] = await Promise.all([
        supabase.from("vd_saved").select("provider_video_id").eq("user_id", userId).in("provider_video_id", ids),
        supabase.from("vd_feedback").select("provider_video_id, useful, reason").eq("user_id", userId).in("provider_video_id", ids),
      ]);
      return {
        saved: new Set((check(saved) || []).map((r) => r.provider_video_id)),
        feedback: new Map((check(feedback) || []).map((r) => [r.provider_video_id, { useful: r.useful, reason: r.reason }])),
      };
    },
    async saveVideo(row) {
      check(await supabase.from("vd_saved").upsert({ provider: "youtube", ...row }, { onConflict: "user_id,provider,provider_video_id" }));
    },
    async unsaveVideo(userId, videoId) {
      check(await supabase.from("vd_saved").delete().eq("user_id", userId).eq("provider_video_id", videoId));
    },
    async listSaved(userId, { limit = 200 } = {}) {
      return check(
        await supabase.from("vd_saved").select("provider_video_id, collection, subject, topic, grade, created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit)
      ) || [];
    },
    async recordHistory(row) {
      check(await supabase.from("vd_history").upsert({ provider: "youtube", ...row, watched_at: now().toISOString() }, { onConflict: "user_id,provider,provider_video_id" }));
    },
    async listHistory(userId, { limit = 50 } = {}) {
      return check(
        await supabase.from("vd_history").select("provider_video_id, subject, topic, subtopic, grade, watched_at")
          .eq("user_id", userId).order("watched_at", { ascending: false }).limit(limit)
      ) || [];
    },
    async clearHistory(userId, videoId) {
      let q = supabase.from("vd_history").delete().eq("user_id", userId);
      if (videoId) q = q.eq("provider_video_id", videoId);
      check(await q);
    },
    /** Video IDs ScientiaForge itself still points at (so the refresh job keeps them fresh). */
    async referencedIds(ids) {
      if (!ids.length) return new Set();
      const [saved, history, flags] = await Promise.all([
        supabase.from("vd_saved").select("provider_video_id").in("provider_video_id", ids),
        supabase.from("vd_history").select("provider_video_id").in("provider_video_id", ids),
        supabase.from("vd_video_flags").select("provider_video_id").eq("status", "verified").in("provider_video_id", ids),
      ]);
      return new Set([...(check(saved) || []), ...(check(history) || []), ...(check(flags) || [])].map((r) => r.provider_video_id));
    },

    /* ---------------------------------------------------------- quota */
    async chargeQuota({ searchCalls = 0, units = 0 }, limits) {
      return Boolean(
        check(await supabase.rpc("vd_charge_quota", {
          p_search_calls: searchCalls, p_units: units, p_max_search_calls: limits.maxSearchCallsPerDay, p_max_units: limits.maxUnitsPerDay,
        }))
      );
    },
    async quotaToday() {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now());
      return check(await supabase.from("vd_api_usage").select("usage_date, search_calls, units").eq("usage_date", day).maybeSingle())
        || { usage_date: day, search_calls: 0, units: 0 };
    },
  };
}

module.exports = { createVideoRepo, VIDEO_COLUMNS };
