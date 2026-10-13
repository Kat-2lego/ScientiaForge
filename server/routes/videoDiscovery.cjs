/**
 * Video Discovery API
 * CommonJS (.cjs) on purpose: routes/package.json makes plain .js files in this folder ES modules.
 * Mount (server.mjs):
 *   import createVideoDiscoveryRouter from "./routes/videoDiscovery.cjs";
 *   app.use("/api/video-discovery", createVideoDiscoveryRouter({ supabase: supabaseAdmin, requireAuth }));
 *
 * Needs YOUTUBE_API_KEY in the backend .env for live search. Without it, the library
 * (curated channels' synced videos + cached searches) still answers.
 *
 *   GET    /taxonomy                           subjects, topics, types, lengths, languages, sorts
 *   GET    /search?subject&grade&curriculum&level&topic&subtopic&types&length&minutes&language&q&sort&page&limit
 *   GET    /videos/:videoId                    one video
 *   POST   /videos/:videoId/save   {collection, subject, topic, grade}      (sign-in)
 *   DELETE /videos/:videoId/save                                             (sign-in)
 *   POST   /videos/:videoId/feedback {useful, reason, subject, topic, grade} (sign-in)
 *   POST   /videos/:videoId/watched {subject, topic, subtopic, grade}        (sign-in)
 *   GET    /saved                                                            (sign-in)
 *   GET    /history ; DELETE /history ; DELETE /history/:videoId              (sign-in)
 *   GET    /continue                                                         (sign-in)
 *   GET    /status                             live search on/off + today's quota use
 */
"use strict";

const express = require("express");
const { loadVideoConfig } = require("../services/video/config");
const { publicTaxonomy } = require("../services/video/taxonomy");
const { createVideoRepo } = require("../services/video/videoRepo");
const { createYouTubeProvider } = require("../services/video/youtubeProvider");
const { createVideoDiscovery, ServiceError } = require("../services/video/discovery");

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Runs your requireAuth, but lets anonymous visitors through (search works signed out). */
function softAuth(requireAuth) {
  return (req, res, next) => {
    let done = false;
    const pass = () => {
      if (!done) {
        done = true;
        next();
      }
    };
    const quietRes = new Proxy(res, {
      get(target, prop) {
        if (["status", "set", "setHeader", "header", "type"].includes(prop)) return () => quietRes;
        if (["json", "send", "end", "sendStatus"].includes(prop)) return pass;
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      requireAuth(req, quietRes, pass);
    } catch {
      pass();
    }
  };
}

function userIdOf(req) {
  const id = req.user && (req.user.id || req.user.sub || req.user.user_id);
  if (!id) throw new ServiceError(401, "Sign in to save videos and keep your history.");
  return id;
}

function createVideoDiscoveryRouter({
  supabase, requireAuth, discovery, repo, provider, config,
  youtubeApiKey = process.env.YOUTUBE_API_KEY, fetch: fetchImpl, log = console,
} = {}) {
  if (typeof requireAuth !== "function") throw new Error("createVideoDiscoveryRouter needs your requireAuth middleware");
  const cfg = config || loadVideoConfig();
  let service = discovery;
  if (!service) {
    const store = repo || createVideoRepo(supabase, { maxAgeDays: cfg.cache.maxAgeDays });
    let yt = provider || null;
    if (!yt && youtubeApiKey) {
      yt = createYouTubeProvider({
        apiKey: youtubeApiKey, config: cfg, fetch: fetchImpl,
        quota: { charge: ({ searchCalls, units }) => store.chargeQuota({ searchCalls, units }, cfg.quota) },
      });
    } else if (!yt) {
      log.warn("[video] YOUTUBE_API_KEY is not set: live search is off, the saved library still works");
    }
    service = createVideoDiscovery({ repo: store, provider: yt, config: cfg, log });
  }

  const router = express.Router();
  router.use(express.json({ limit: "16kb" }));
  const maybeUser = softAuth(requireAuth);
  const optionalUserId = (req) => (req.user && (req.user.id || req.user.sub || req.user.user_id)) || null;

  router.get("/taxonomy", (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json(publicTaxonomy());
  });

  router.get(
    "/search",
    maybeUser,
    wrap(async (req, res) => {
      const q = req.query;
      const filters = {
        subject: q.subject, grade: q.grade, curriculum: q.curriculum, level: q.level,
        topic: q.topic, subtopic: q.subtopic, types: q.types, length: q.length,
        minutes: q.minutes, language: q.language, q: q.q, sort: q.sort,
        page: q.page, limit: q.limit, no_detect: q.no_detect === "1",
      };
      res.json(await service.search(filters, { userId: optionalUserId(req) }));
    })
  );

  router.get("/status", wrap(async (_req, res) => res.json(await service.status())));

  router.get(
    "/videos/:videoId",
    maybeUser,
    wrap(async (req, res) => res.json(await service.getVideo(req.params.videoId, { userId: optionalUserId(req) })))
  );

  router.post("/videos/:videoId/save", requireAuth, wrap(async (req, res) => res.json(await service.save(userIdOf(req), req.params.videoId, req.body))));
  router.delete("/videos/:videoId/save", requireAuth, wrap(async (req, res) => res.json(await service.unsave(userIdOf(req), req.params.videoId))));
  router.post("/videos/:videoId/feedback", requireAuth, wrap(async (req, res) => res.json(await service.feedback(userIdOf(req), req.params.videoId, req.body))));
  router.post("/videos/:videoId/watched", requireAuth, wrap(async (req, res) => res.json(await service.watched(userIdOf(req), req.params.videoId, req.body))));
  router.get("/saved", requireAuth, wrap(async (req, res) => res.json(await service.listSaved(userIdOf(req)))));
  router.get("/history", requireAuth, wrap(async (req, res) => res.json(await service.history(userIdOf(req), { limit: req.query.limit }))));
  router.delete("/history", requireAuth, wrap(async (req, res) => res.json(await service.clearHistory(userIdOf(req)))));
  router.delete("/history/:videoId", requireAuth, wrap(async (req, res) => res.json(await service.clearHistory(userIdOf(req), req.params.videoId))));
  router.get("/continue", requireAuth, wrap(async (req, res) => res.json(await service.continueLearning(userIdOf(req)))));

  // eslint-disable-next-line no-unused-vars
  router.use((err, _req, res, _next) => {
    if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
    if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
    log.error("[video]", err && err.message);
    res.status(500).json({ error: "Video search is temporarily unavailable. Please try again." });
  });

  return router;
}

module.exports = createVideoDiscoveryRouter;
module.exports.createVideoDiscoveryRouter = createVideoDiscoveryRouter;
module.exports.softAuth = softAuth;
