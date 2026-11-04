import express from "express";
import { randomUUID } from "crypto";

const BUCKET = "ads";
const DEFAULT_INTERVAL_MINUTES = 15;
const DEFAULT_CLOSE_SECONDS = 12;
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
];

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanAd(body = {}) {
  const title = String(body.title || "").trim();
  const mediaType = body.media_type;
  const mediaUrl = String(body.media_url || "").trim();
  const destinationUrl = String(body.destination_url || "").trim();
  const closeAfter = Number(body.close_after_seconds ?? DEFAULT_CLOSE_SECONDS);

  if (!title || title.length > 150) {
    throw new Error("Enter an ad title of no more than 150 characters.");
  }
  if (!["image", "video"].includes(mediaType)) {
    throw new Error("Media type must be image or video.");
  }
  if (!validHttpsUrl(mediaUrl)) {
    throw new Error("The media URL must use HTTPS.");
  }
  if (!validHttpsUrl(destinationUrl)) {
    throw new Error("The destination URL must use HTTPS.");
  }
  if (!Number.isInteger(closeAfter) || closeAfter < 10 || closeAfter > 30) {
    throw new Error("The close delay must be between 10 and 30 seconds.");
  }

  const startsAt = body.starts_at || null;
  const endsAt = body.ends_at || null;

  if (startsAt && Number.isNaN(Date.parse(startsAt))) {
    throw new Error("Invalid campaign start date.");
  }
  if (endsAt && Number.isNaN(Date.parse(endsAt))) {
    throw new Error("Invalid campaign end date.");
  }
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new Error("The campaign end date must be after its start date.");
  }

  return {
    title,
    media_type: mediaType,
    media_url: mediaUrl,
    media_path: body.media_path || null,
    destination_url: destinationUrl,
    close_after_seconds: closeAfter,
    is_active: Boolean(body.is_active),
    starts_at: startsAt,
    ends_at: endsAt,
  };
}

export default function createAdsRouter({ db, requireAuth }) {
  const router = express.Router();

  if (!db) {
    throw new Error("Ads router requires the Supabase service-role client.");
  }

  // -------------------------------------------------------
  // AUTHENTICATION AND ADMIN ACCESS
  // -------------------------------------------------------

  async function requireAdmin(req, res, next) {
    try {
      const { data: user, error } = await db
        .from("users")
        .select("role")
        .eq("id", req.userId)
        .single();

      if (error || !user || user.role !== "admin") {
        return res.status(403).json({ error: "Administrator access required." });
      }

      next();
    } catch (error) {
      console.error("Ads admin check failed:", error);
      res.status(500).json({ error: "Could not verify administrator access." });
    }
  }

  const authenticated = [requireAuth];
  const adminOnly = [requireAuth, requireAdmin];

  // -------------------------------------------------------
  // SETTINGS
  // -------------------------------------------------------

  async function getSetting(key, fallback) {
    const { data, error } = await db
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) throw error;
    if (!data) return fallback;
    return data.value;
  }

  async function saveSetting(key, value) {
    const { error } = await db
      .from("app_settings")
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) throw error;
  }

  // -------------------------------------------------------
  // PLAN CHECK (users.plan_type only)
  // 'premium' = no ads, anything else ('standard') = ads
  // -------------------------------------------------------

     async function isPremium(userId) {
    const { data: user, error } = await db
      .from("users")
      .select("plan_type, role")
      .eq("id", userId)
      .single();

    if (error || !user) {
      throw new Error("Could not verify the user's account.");
    }

    if (user.role === "admin") return true;

    return user.plan_type === "premium";
  }

  // -------------------------------------------------------
  // USER: GET NEXT AD
  // -------------------------------------------------------

  router.get("/next", authenticated, async (req, res) => {
    const log = (msg) => console.log(`[ads] user ${req.userId}: ${msg}`);

    try {
      if (await isPremium(req.userId)) {
        log("no ad - plan_type is premium");
        return res.json({ ad: null });
      }

      const enabled = await getSetting("ads_enabled", true);
      if (enabled === false || enabled === "false") {
        log("no ad - ads_enabled is false in app_settings");
        return res.json({ ad: null });
      }

      const interval = Number(
        await getSetting("ads_interval_minutes", DEFAULT_INTERVAL_MINUTES)
      );

      const { data: user, error: userError } = await db
        .from("users")
        .select("last_ad_shown_at, last_ad_id")
        .eq("id", req.userId)
        .single();

      if (userError || !user) {
        throw new Error("Could not retrieve ad schedule.");
      }

      if (user.last_ad_shown_at) {
        const nextAllowed =
          new Date(user.last_ad_shown_at).getTime() + interval * 60 * 1000;

        if (Date.now() < nextAllowed) {
          const mins = Math.ceil((nextAllowed - Date.now()) / 60000);
          log(`no ad - next one allowed in ${mins} min`);
          return res.json({ ad: null });
        }
      }

      const nowIso = new Date().toISOString();

      const { data: allAds, error: adsError } = await db
        .from("ads")
        .select(
          "id, title, media_type, media_url, destination_url, close_after_seconds, is_active, starts_at, ends_at"
        );

      if (adsError) throw adsError;

      const live = (allAds || []).filter(
        (ad) =>
          ad.is_active &&
          (!ad.starts_at || new Date(ad.starts_at) <= new Date(nowIso)) &&
          (!ad.ends_at || new Date(ad.ends_at) > new Date(nowIso))
      );

      if (live.length === 0) {
        log(
          `no ad - ${allAds?.length || 0} ads exist but none are live (check Active status and start/end dates)`
        );
        return res.json({ ad: null });
      }

      let pool = live;
      if (live.length > 1 && user.last_ad_id) {
        pool = live.filter((ad) => ad.id !== user.last_ad_id);
      }

      const selected = pool[Math.floor(Math.random() * pool.length)];

      const { error: updateError } = await db
        .from("users")
        .update({ last_ad_shown_at: nowIso, last_ad_id: selected.id })
        .eq("id", req.userId);

      if (updateError) throw updateError;

      log(`SERVED ad "${selected.title}"`);

      return res.json({
        ad: {
          id: selected.id,
          title: selected.title,
          media_type: selected.media_type,
          media_url: selected.media_url,
          destination_url: selected.destination_url,
          close_after_seconds: selected.close_after_seconds,
        },
      });
    } catch (error) {
      console.error("[ads] /next failed:", error);
      return res.json({ ad: null });
    }
  });

  // -------------------------------------------------------
  // USER: RECORD AD EVENT
  // -------------------------------------------------------

  router.post("/event", authenticated, async (req, res) => {
    try {
      const { ad_id, event_type } = req.body || {};

      if (!ad_id || !["impression", "click", "close"].includes(event_type)) {
        console.log("[ads] event rejected - bad body:", req.body);
        return res.status(400).json({ error: "Invalid advertising event." });
      }

      const { error } = await db.from("ad_events").insert({
        ad_id,
        user_id: req.userId,
        event_type,
      });

      if (error) {
        console.error("[ads] event insert failed:", error.message);
        return res.status(500).json({ error: error.message });
      }

      console.log(`[ads] event recorded: ${event_type}`);
      return res.json({ success: true });
    } catch (error) {
      console.error("[ads] event error:", error);
      return res.status(500).json({ error: "Could not record advertising event." });
    }
  });

  // -------------------------------------------------------
  // ADMIN: OVERVIEW
  // -------------------------------------------------------

  router.get("/admin/overview", adminOnly, async (req, res) => {
    try {
      const [adsResult, eventsResult, enabled, interval] = await Promise.all([
        db.from("ads").select("*").order("created_at", { ascending: false }),
        db.from("ad_events").select("ad_id, event_type, created_at, user_id"),
        getSetting("ads_enabled", true),
        getSetting("ads_interval_minutes", DEFAULT_INTERVAL_MINUTES),
      ]);

      if (adsResult.error) throw adsResult.error;
      if (eventsResult.error) throw eventsResult.error;

      const ads = adsResult.data || [];
      const events = eventsResult.data || [];

      const impressions = events.filter((e) => e.event_type === "impression").length;
      const clicks = events.filter((e) => e.event_type === "click").length;
      const closes = events.filter((e) => e.event_type === "close").length;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      const uniqueUsers = new Set(
        events.filter((e) => e.user_id).map((e) => e.user_id)
      ).size;

      const dailyMap = {};

      for (const event of events) {
        const day = event.created_at.slice(0, 10);

        if (!dailyMap[day]) {
          dailyMap[day] = { date: day, impressions: 0, clicks: 0, closes: 0 };
        }

        if (event.event_type === "impression") dailyMap[day].impressions += 1;
        if (event.event_type === "click") dailyMap[day].clicks += 1;
        if (event.event_type === "close") dailyMap[day].closes += 1;
      }

      return res.json({
        ads,
        stats: {
          impressions,
          clicks,
          closes,
          ctr: Number(ctr.toFixed(2)),
          unique_users: uniqueUsers,
          active_ads: ads.filter((ad) => ad.is_active).length,
          total_ads: ads.length,
        },
        daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
        settings: {
          enabled: enabled !== false && enabled !== "false",
          interval_minutes: Number(interval),
        },
      });
    } catch (error) {
      console.error("Ads overview failed:", error);
      return res.status(500).json({ error: "Could not load advertising overview." });
    }
  });

  // -------------------------------------------------------
  // ADMIN: SETTINGS
  // -------------------------------------------------------

  router.put("/admin/settings", adminOnly, async (req, res) => {
    try {
      const enabled = Boolean(req.body.enabled);
      const interval = Number(req.body.interval_minutes);

      if (!Number.isInteger(interval) || interval < 5 || interval > 1440) {
        return res
          .status(400)
          .json({ error: "Ad interval must be between 5 and 1440 minutes." });
      }

      await saveSetting("ads_enabled", enabled);
      await saveSetting("ads_interval_minutes", interval);

      return res.json({
        success: true,
        settings: { enabled, interval_minutes: interval },
      });
    } catch (error) {
      console.error("Could not update ad settings:", error);
      return res.status(500).json({ error: "Could not update advertising settings." });
    }
  });

  // -------------------------------------------------------
  // ADMIN: SIGNED UPLOAD URL
  // -------------------------------------------------------

  router.post("/admin/upload-url", adminOnly, async (req, res) => {
    try {
      const { file_name, content_type, file_size } = req.body || {};

      if (!ALLOWED_MIME_TYPES.includes(content_type)) {
        return res.status(400).json({ error: "Unsupported image or video format." });
      }

      if (
        !Number.isFinite(Number(file_size)) ||
        Number(file_size) <= 0 ||
        Number(file_size) > MAX_UPLOAD_SIZE
      ) {
        return res.status(400).json({ error: "File must be smaller than 50 MB." });
      }

      const extension = String(file_name || "")
        .split(".")
        .pop()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      if (!extension) {
        return res.status(400).json({ error: "Invalid file name." });
      }

      const filePath = `${randomUUID()}.${extension}`;

      const { data, error } = await db.storage
        .from(BUCKET)
        .createSignedUploadUrl(filePath);

      if (error) throw error;

      const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(filePath);

      return res.json({
        path: filePath,
        token: data.token,
        signed_url: data.signedUrl,
        public_url: publicData.publicUrl,
      });
    } catch (error) {
      console.error("Could not create ad upload URL:", error);
      return res.status(500).json({ error: "Could not prepare the file upload." });
    }
  });

  // -------------------------------------------------------
  // ADMIN: CREATE / UPDATE / DELETE
  // -------------------------------------------------------

  router.post("/admin", adminOnly, async (req, res) => {
    try {
      const ad = cleanAd(req.body);

      const { data, error } = await db
        .from("ads")
        .insert({ ...ad, created_by: req.userId })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({ success: true, ad: data });
    } catch (error) {
      console.error("Could not create ad:", error);
      return res
        .status(400)
        .json({ error: error.message || "Could not create advertisement." });
    }
  });

  router.put("/admin/:id", adminOnly, async (req, res) => {
    try {
      const ad = cleanAd(req.body);

      const { data, error } = await db
        .from("ads")
        .update({ ...ad, updated_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) throw error;

      return res.json({ success: true, ad: data });
    } catch (error) {
      console.error("Could not update ad:", error);
      return res
        .status(400)
        .json({ error: error.message || "Could not update advertisement." });
    }
  });

  router.delete("/admin/:id", adminOnly, async (req, res) => {
    try {
      const { data: ad, error: fetchError } = await db
        .from("ads")
        .select("id, media_path")
        .eq("id", req.params.id)
        .single();

      if (fetchError || !ad) {
        return res.status(404).json({ error: "Advertisement not found." });
      }

      const { error } = await db.from("ads").delete().eq("id", req.params.id);
      if (error) throw error;

      if (ad.media_path) {
        const { error: storageError } = await db.storage
          .from(BUCKET)
          .remove([ad.media_path]);

        if (storageError) {
          console.warn("Ad media cleanup failed:", storageError.message);
        }
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Could not delete ad:", error);
      return res.status(500).json({ error: "Could not delete advertisement." });
    }
  });

  return router;
}