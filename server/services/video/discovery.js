/**
 * Video Discovery service: everything between the router and the data.
 *
 *   filters -> request (+ subject/topic detection from the learner's words) -> candidate pool
 *      pool = cached/live YouTube search + curated channels' videos + SkillForge-verified videos
 *   -> rank (gates, SkillForge Match, relaxation, diversity) -> page -> learner's own state
 *
 * Quota: one search per distinct request (cached for cache.searchTtlHours), metadata in
 * batches of 50 for 1 unit. When the budget is used up the library still answers.
 */
"use strict";

const tx = require("./taxonomy");
const { buildRequest, providerQuery, rankPool, groupResults, RequestError } = require("./ranking");
const { VIDEO_ID_RE, QuotaExceededError } = require("./youtubeProvider");

class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const UNAVAILABLE = "Live video search is temporarily unavailable, so these results come from ScientiaForge's saved library.";
const QUOTA = "Live YouTube search has reached today's limit, so these results come from ScientiaForge's saved library.";

function thumbnailFor(video) {
  return video.thumbnail_url || `https://i.ytimg.com/vi/${video.provider_video_id}/mqdefault.jpg`;
}

/** What the browser gets for one video. YouTube's own numbers stay labelled as YouTube's. */
function videoDto(video, extra = {}) {
  return {
    id: video.provider_video_id,
    provider: "youtube",
    source: "YouTube",
    title: video.title,
    channel: { id: video.channel_id, title: video.channel_title },
    thumbnail_url: thumbnailFor(video),
    published_at: video.published_at,
    duration_seconds: video.duration_seconds,
    youtube_stats: { views: video.view_count, likes: video.like_count, comments: video.comment_count },
    url: `https://www.youtube.com/watch?v=${video.provider_video_id}`,
    embed_url: `https://www.youtube-nocookie.com/embed/${video.provider_video_id}`,
    ...extra,
  };
}

function scoredDto(s, state) {
  return videoDto(s.video, {
    match: s.match,
    confidence: s.confidence,
    reasons: s.reasons,
    cautions: s.cautions,
    badges: s.badges,
    types: s.types,
    breakdown: s.breakdown,
    saved: state.saved.has(s.video.provider_video_id),
    my_feedback: state.feedback.get(s.video.provider_video_id) || null,
  });
}

function publicRequest(req) {
  return {
    subject: req.subject, subject_name: req.subjectNode.name,
    topic: req.topic, topic_name: req.topicNode && req.topicNode.name,
    subtopic: req.subtopic, subtopic_name: req.subtopicNode && req.subtopicNode.name,
    grade: req.grade, curriculum: req.curriculum, level: req.level, types: req.types,
    length: req.length, minutes: req.minutes, language: req.language, q: req.query || null,
  };
}

/** What was worked out from the learner's words, so the page can say so and offer an undo. */
function detectedDto(d, subjectDetected) {
  const subject = tx.getSubject(d.subject);
  return {
    subject: d.subject,
    subject_name: subject ? subject.name : null,
    subject_detected: subjectDetected,
    topic: d.topic || null,
    subtopic: d.subtopic || null,
    name: d.name,
    matched: d.phrase,
  };
}

function createVideoDiscovery({ repo, provider = null, config, now = () => new Date(), log = console }) {
  const cfg = config;
  const ageDays = (row) => (now() - new Date(row.fetched_at)) / 86400000;
  const fresh = (row) => row && ageDays(row) <= cfg.cache.maxAgeDays;

  function requireVideoId(id) {
    if (!VIDEO_ID_RE.test(String(id || ""))) throw new ServiceError(404, "Video not found.");
    return String(id);
  }

  /** Metadata for ids: cache first, refreshed from YouTube when missing or older than refreshAfterDays. */
  async function loadVideos(ids, { allowFetch, notices }) {
    const unique = [...new Set(ids)];
    const byId = new Map((await repo.getVideos(unique)).filter(fresh).map((r) => [r.provider_video_id, r]));
    const need = unique.filter((id) => !byId.has(id) || ageDays(byId.get(id)) > cfg.cache.refreshAfterDays);
    if (need.length && provider && allowFetch) {
      try {
        const got = await provider.getVideos(need);
        if (got.length) await repo.upsertVideos(got);
        for (const v of got) byId.set(v.provider_video_id, v);
      } catch (err) {
        noteProviderError(err, notices);
      }
    }
    return byId;
  }

  function noteProviderError(err, notices) {
    const quota = err instanceof QuotaExceededError || err.code === "quota_exceeded";
    const message = quota ? QUOTA : UNAVAILABLE;
    if (!notices.some((n) => n.message === message)) notices.push({ kind: quota ? "quota" : "unavailable", message });
    log.warn(`[video] ${err.code || "error"}: ${err.message}`); // never includes the API key
  }

  /** The candidate pool for a request. */
  async function candidates(req, { liveSearch, notices }) {
    const q = providerQuery(req);
    let source = "library";
    let searchIds = [];
    const cached = await repo.getSearchCache(q.key);
    if (cached) {
      searchIds = cached.video_ids || [];
      source = "cache";
    } else if (provider && liveSearch) {
      try {
        searchIds = await provider.search({ q: q.text, relevanceLanguage: q.relevanceLanguage });
        source = "live";
        await repo.putSearchCache({
          cache_key: q.key, query_text: q.text, video_ids: searchIds,
          fetched_at: now().toISOString(),
          expires_at: new Date(now().getTime() + cfg.cache.searchTtlHours * 3600000).toISOString(),
        });
      } catch (err) {
        noteProviderError(err, notices);
      }
    }

    const channels = await repo.listChannels();
    const curated = channels.filter((c) => c.trust_level > 0 && (!(c.subjects || []).length || c.subjects.includes(req.subject)));
    const [channelVideos, verified] = await Promise.all([
      repo.getChannelVideos(curated.map((c) => c.provider_channel_id), { limit: cfg.results.maxCuratedCandidates }),
      repo.verifiedIds(req.subject),
    ]);
    const byId = await loadVideos([...searchIds, ...verified], { allowFetch: liveSearch, notices });
    for (const v of channelVideos) if (fresh(v) && !byId.has(v.provider_video_id)) byId.set(v.provider_video_id, v);
    return { pool: [...byId.values()], channels, source, query: q };
  }

  async function rankFor(req, { liveSearch = true, sort = "recommended", notices = [] } = {}) {
    const { pool, channels, source, query } = await candidates(req, { liveSearch, notices });
    const ids = pool.map((v) => v.provider_video_id);
    const [flags, feedback] = await Promise.all([repo.getFlags(ids), repo.feedbackStats(ids)]);
    const ctx = { channels: new Map(channels.map((c) => [c.provider_channel_id, c])), flags, feedback };
    const ranked = rankPool(pool, req, ctx, cfg, { now: now(), sort });
    return { ranked, source, query, notices };
  }

  return {
    /** Main search. */
    async search(filters, { userId = null, liveSearch = true } = {}) {
      let detected = null;
      const words = String(filters.q || "").trim();
      // No subject chosen: work it out from what they typed ("photosynthesis" -> Life Sciences).
      if (!filters.subject && words && !filters.no_detect) {
        const d = tx.detectTopic(words, null);
        if (d && d.confidence === "high") {
          filters = { ...filters, subject: d.subject, topic: d.topic || "", subtopic: d.subtopic || "" };
          detected = detectedDto(d, true);
        }
      }
      if (!filters.subject) {
        throw new ServiceError(
          400,
          words
            ? "We couldn't tell which subject that is. Choose a subject, or add more detail (for example: grade 12 trigonometry)."
            : "Choose a subject, or type what you want to learn."
        );
      }
      let req;
      try {
        req = buildRequest(filters);
      } catch (err) {
        if (err instanceof RequestError) throw new ServiceError(400, err.message);
        throw err;
      }
      if (!detected && !req.topic && req.query && !filters.no_detect) {
        const d = tx.detectTopic(req.query, req.subject);
        if (d && d.confidence === "high" && d.subject === req.subject && d.topic) {
          req = buildRequest({ ...filters, topic: d.topic, subtopic: d.subtopic });
          detected = detectedDto(d, false);
        }
      }
      const sort = String(filters.sort || "recommended");
      const limit = Math.min(cfg.results.maxPageSize, Math.max(1, Number(filters.limit) || cfg.results.pageSize));
      const page = Math.max(1, Number(filters.page) || 1);
      const exclude = new Set([].concat(filters.exclude || []));

      const { ranked, source, query, notices } = await rankFor(req, { liveSearch, sort });
      const items = ranked.items.filter((s) => !exclude.has(s.video.provider_video_id));
      const pageItems = items.slice((page - 1) * limit, page * limit);
      const state = await repo.userStates(userId, pageItems.map((s) => s.video.provider_video_id));
      const groups =
        sort === "recommended" && page === 1 && items.length > cfg.results.topMatches
          ? groupResults(items, cfg).map((g) => ({ id: g.id, name: g.name, ids: g.items.map((s) => s.video.provider_video_id) }))
          : null;
      // group members beyond the current page still need their card data
      const groupIds = new Set(groups ? groups.flatMap((g) => g.ids) : []);
      const extra = items.filter((s) => groupIds.has(s.video.provider_video_id) && !pageItems.includes(s));
      const extraState = await repo.userStates(userId, extra.map((s) => s.video.provider_video_id));
      const merged = { saved: new Set([...state.saved, ...extraState.saved]), feedback: new Map([...state.feedback, ...extraState.feedback]) };

      if (!items.length && !notices.length) {
        notices.push({ kind: "empty", message: "We couldn't find videos matching all of your filters." });
      }
      return {
        request: publicRequest(req),
        detected,
        relaxed: ranked.relaxed,
        notices,
        source,
        query_used: query.text,
        total: items.length,
        page,
        limit,
        results: pageItems.map((s) => scoredDto(s, merged)),
        group_members: extra.map((s) => scoredDto(s, merged)),
        groups,
        related_topics: tx.relatedTopics(req.subject, req.topic, req.subtopic),
      };
    },

    async getVideo(videoId, { userId = null } = {}) {
      const id = requireVideoId(videoId);
      const notices = [];
      const byId = await loadVideos([id], { allowFetch: true, notices });
      const video = byId.get(id);
      if (!video) throw new ServiceError(404, "Video details are unavailable right now.");
      const [state, stats] = await Promise.all([repo.userStates(userId, [id]), repo.feedbackStats([id])]);
      const s = stats.get(id) || { up: 0, down: 0 };
      return {
        video: videoDto(video, {
          saved: state.saved.has(id),
          my_feedback: state.feedback.get(id) || null,
          learner_feedback: s.up + s.down >= cfg.feedback.minVotesToShow ? { useful: s.up, not_useful: s.down } : null,
        }),
      };
    },

    async save(userId, videoId, body = {}) {
      const id = requireVideoId(videoId);
      const collection = body.collection ? String(body.collection).trim().slice(0, 60) : null;
      await repo.saveVideo({
        user_id: userId, provider_video_id: id, collection: collection || null,
        subject: tx.getSubject(body.subject) ? body.subject : null,
        topic: body.topic ? String(body.topic).slice(0, 60) : null,
        grade: [8, 9, 10, 11, 12].includes(Number(body.grade)) ? Number(body.grade) : null,
      });
      return { saved: true };
    },

    async unsave(userId, videoId) {
      await repo.unsaveVideo(userId, requireVideoId(videoId));
      return { saved: false };
    },

    /** Saved videos grouped by subject -> topic, with fresh metadata (or a plain "unavailable"). */
    async listSaved(userId) {
      const rows = await repo.listSaved(userId);
      const notices = [];
      const byId = await loadVideos(rows.map((r) => r.provider_video_id), { allowFetch: true, notices });
      const items = rows.map((r) => {
        const v = byId.get(r.provider_video_id);
        const base = { saved_at: r.created_at, collection: r.collection, subject: r.subject, topic: r.topic, grade: r.grade };
        return v
          ? { ...videoDto(v, { saved: true }), ...base }
          : { id: r.provider_video_id, unavailable: true, saved: true, url: `https://www.youtube.com/watch?v=${r.provider_video_id}`, ...base };
      });
      const groups = new Map();
      for (const it of items) {
        const subject = (tx.getSubject(it.subject) || {}).name || "Other";
        const topic = (it.subject && it.topic && tx.getTopic(it.subject, it.topic) || {}).name || it.collection || "General";
        const key = `${subject}|${topic}`;
        if (!groups.has(key)) groups.set(key, { subject, topic, items: [] });
        groups.get(key).items.push(it);
      }
      return { total: items.length, groups: [...groups.values()], notices };
    },

    async feedback(userId, videoId, body = {}) {
      const id = requireVideoId(videoId);
      if (typeof body.useful !== "boolean") throw new ServiceError(400, "Say whether the video was useful.");
      const allowed = (body.useful ? tx.FEEDBACK_REASONS.useful : tx.FEEDBACK_REASONS.not_useful).map((r) => r.id);
      const reason = body.reason ? String(body.reason) : null;
      if (reason && !allowed.includes(reason)) throw new ServiceError(400, "That reason doesn't match your answer.");
      await repo.upsertFeedback({
        user_id: userId, provider_video_id: id, useful: body.useful, reason,
        subject: tx.getSubject(body.subject) ? body.subject : null,
        topic: body.topic ? String(body.topic).slice(0, 60) : null,
        grade: [8, 9, 10, 11, 12].includes(Number(body.grade)) ? Number(body.grade) : null,
      });
      return { useful: body.useful, reason };
    },

    async watched(userId, videoId, body = {}) {
      const id = requireVideoId(videoId);
      await repo.recordHistory({
        user_id: userId, provider_video_id: id,
        subject: tx.getSubject(body.subject) ? body.subject : null,
        topic: body.topic ? String(body.topic).slice(0, 60) : null,
        subtopic: body.subtopic ? String(body.subtopic).slice(0, 60) : null,
        grade: [8, 9, 10, 11, 12].includes(Number(body.grade)) ? Number(body.grade) : null,
      });
      return { recorded: true };
    },

    async history(userId, { limit = 50 } = {}) {
      const rows = await repo.listHistory(userId, { limit: Math.min(100, Math.max(1, Number(limit) || 50)) });
      const byId = await loadVideos(rows.map((r) => r.provider_video_id), { allowFetch: false, notices: [] });
      return {
        items: rows.map((r) => {
          const v = byId.get(r.provider_video_id);
          const base = { watched_at: r.watched_at, subject: r.subject, topic: r.topic, subtopic: r.subtopic, grade: r.grade };
          return v ? { ...videoDto(v), ...base } : { id: r.provider_video_id, unavailable: true, url: `https://www.youtube.com/watch?v=${r.provider_video_id}`, ...base };
        }),
      };
    },

    async clearHistory(userId, videoId) {
      await repo.clearHistory(userId, videoId ? requireVideoId(videoId) : null);
      return { cleared: true };
    },

    /** "Continue learning": the topic the learner watched last, and the best video they haven't seen. */
    async continueLearning(userId) {
      const history = await repo.listHistory(userId, { limit: 30 });
      const last = history.find((h) => h.subject && tx.getSubject(h.subject));
      if (!last) return { continue: null };
      const topic = last.topic && tx.getTopic(last.subject, last.topic) ? last.topic : null;
      const subtopic = topic && last.subtopic && tx.getSubtopic(last.subject, topic, last.subtopic) ? last.subtopic : null;
      const result = await this.search(
        { subject: last.subject, topic, subtopic, grade: last.grade, exclude: history.map((h) => h.provider_video_id), limit: 3 },
        { userId, liveSearch: false }
      );
      return {
        continue: {
          subject: last.subject, topic, subtopic, grade: last.grade,
          label: [last.grade ? `Grade ${last.grade}` : null, result.request.subject_name, result.request.topic_name, result.request.subtopic_name].filter(Boolean),
          next: result.results,
        },
      };
    },

    async status() {
      const usage = await repo.quotaToday();
      return {
        live_search: Boolean(provider),
        quota: { date: usage.usage_date, search_calls: usage.search_calls, search_limit: cfg.quota.maxSearchCallsPerDay, units: usage.units, unit_limit: cfg.quota.maxUnitsPerDay },
      };
    },

    /* ---------------------------------------------------------- maintenance (admin CLI) */

    /** Pull recent uploads of curated channels into the cache (cheap: ~1 unit per 50 videos). */
    async syncChannels({ maxPerChannel = 200, only } = {}) {
      if (!provider) throw new ServiceError(503, "Set YOUTUBE_API_KEY to sync channels.");
      const report = [];
      for (const channel of await repo.listChannels()) {
        if (channel.trust_level === 0 || (only && channel.provider_channel_id !== only && channel.handle !== only)) continue;
        try {
          let playlist = channel.uploads_playlist_id;
          if (!playlist || !fresh({ fetched_at: channel.fetched_at || 0 })) {
            const info = await provider.getChannel({ id: channel.provider_channel_id });
            if (!info) throw new Error("channel not found on YouTube");
            playlist = info.uploads_playlist_id;
            await repo.updateChannel(channel.provider_channel_id, { title: info.title, uploads_playlist_id: playlist, fetched_at: now().toISOString() });
          }
          const ids = await provider.listUploads(playlist, { max: maxPerChannel });
          const have = new Map((await repo.getVideos(ids)).map((r) => [r.provider_video_id, r]));
          const need = ids.filter((id) => !have.has(id) || ageDays(have.get(id)) > cfg.cache.refreshAfterDays);
          const got = need.length ? await provider.getVideos(need) : [];
          await repo.upsertVideos(got);
          await repo.updateChannel(channel.provider_channel_id, { last_synced_at: now().toISOString() });
          report.push({ channel: channel.title || channel.provider_channel_id, uploads: ids.length, refreshed: got.length });
        } catch (err) {
          report.push({ channel: channel.title || channel.provider_channel_id, error: err.message });
          if (err instanceof QuotaExceededError) break;
        }
      }
      return report;
    },

    /** The 30-day rule: refresh cached data still in use, delete the rest once it is too old. */
    async refreshAndPurge() {
      let refreshed = 0;
      if (provider) {
        const stale = await repo.staleVideoIds({ olderThanDays: cfg.cache.refreshAfterDays });
        const channels = await repo.listChannels();
        const curatedIds = new Set(channels.filter((c) => c.trust_level > 0).map((c) => c.provider_channel_id));
        const staleRows = await repo.getVideos(stale);
        const referenced = await repo.referencedIds(stale);
        const keep = stale.filter((id) => referenced.has(id) || staleRows.some((r) => r.provider_video_id === id && curatedIds.has(r.channel_id)));
        try {
          const got = await provider.getVideos(keep);
          await repo.upsertVideos(got);
          refreshed = got.length;
        } catch (err) {
          log.warn(`[video] refresh stopped: ${err.message}`);
        }
      }
      const purged = await repo.purgeStale(cfg.cache.maxAgeDays);
      return { refreshed, purged };
    },
  };
}

module.exports = { createVideoDiscovery, ServiceError, videoDto };
