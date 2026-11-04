// =====================================================
// SCIENTIAFORGE GLOBAL ADVERTISEMENT MANAGER
// =====================================================
(() => {
  if (window.__sfAdManagerStarted) return;
  window.__sfAdManagerStarted = true;

  const API = "/api/ads";
      const LOG = (...args) => console.log("[ads]", ...args);
  let currentAd = null;
  let popupElement = null;
  let closeButton = null;
  let closeTimer = null;

  // ---------------------------------------------------
  // TOKEN (tries every common storage location)
  // ---------------------------------------------------
  function getToken() {
    const direct =
      localStorage.getItem("sb-access-token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("sf_access_token") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("sb-access-token") ||
      sessionStorage.getItem("access_token") ||
      sessionStorage.getItem("token");
    if (direct) return direct;

    // Supabase's own format: sb-<project>-auth-token
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key));
          if (parsed?.access_token) return parsed.access_token;
        } catch (_) {}
      }
    }
    return null;
  }

    function getHeaders() {
    const base =
      typeof window.getAuthHeaders === "function" ? window.getAuthHeaders() : {};

    const headers = { "Content-Type": "application/json", ...base };

    if (!headers.Authorization) {
      headers.Authorization = `Bearer ${getToken()}`;
    }

    return headers;
  }

  // ---------------------------------------------------
  // PAGE ELIGIBILITY
  // ---------------------------------------------------
  function canDisplayAds() {
    if (document.body?.dataset.noAds === "true") {
      LOG("skipped - page has data-no-ads");
      return false;
    }

    const pageName = location.pathname.split("/").pop().toLowerCase();
    if (pageName.startsWith("admin")) {
      LOG("skipped - admin page");
      return false;
    }

    if (!getToken()) {
      LOG("skipped - no access token found in browser storage");
      return false;
    }

    return true;
  }

      function pageIsBusy() {
    const active = document.activeElement;
    if (active && ["INPUT", "TEXTAREA"].includes(active.tagName)) return true;

    return [...document.querySelectorAll("video")].some(
      (v) => !v.paused && !v.ended && v.offsetParent !== null
    );
  }
  

  // ---------------------------------------------------
  // EVENTS
  // ---------------------------------------------------
    async function recordEvent(adId, eventType) {
    try {
      const response = await fetch(`${API}/event`, {
        method: "POST",
        headers: getHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ ad_id: adId, event_type: eventType }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        LOG(`event "${eventType}" FAILED`, response.status, text);
      } else {
        LOG(`event "${eventType}" recorded`);
      }
    } catch (error) {
      LOG("event error", error.message);
    }
  }

  function getSafeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------
  // POPUP
  // ---------------------------------------------------
  function createPopup(ad) {
    const overlay = document.createElement("div");
    overlay.className = "sf-ad-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Advertisement");

    const container = document.createElement("div");
    container.className = "sf-ad-container";

    const header = document.createElement("div");
    header.className = "sf-ad-header";

    const label = document.createElement("span");
    label.textContent = "ADVERTISEMENT";

    closeButton = document.createElement("button");
    closeButton.className = "sf-ad-close";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Close advertisement");
    closeButton.hidden = true;

    header.append(label, closeButton);

    const mediaLink = document.createElement("a");
    mediaLink.className = "sf-ad-media-link";
    mediaLink.href = getSafeUrl(ad.destination_url);
    mediaLink.target = "_blank";
    mediaLink.rel = "noopener noreferrer";
    mediaLink.setAttribute("aria-label", "Visit advertiser website");

    if (ad.media_type === "video") {
      const video = document.createElement("video");
      video.src = getSafeUrl(ad.media_url);
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = false;
      video.preload = "auto";
      mediaLink.appendChild(video);
      video.play().catch(() => {});
    } else {
      const image = document.createElement("img");
      image.src = getSafeUrl(ad.media_url);
      image.alt = ad.title || "Advertisement";
      image.loading = "eager";
      mediaLink.appendChild(image);
    }

    const footer = document.createElement("div");
    footer.className = "sf-ad-footer";

    const title = document.createElement("span");
    title.textContent = ad.title || "Sponsored advertisement";

    const sponsored = document.createElement("span");
    sponsored.textContent = "Sponsored";

    footer.append(title, sponsored);

    container.append(header, mediaLink, footer);
    overlay.appendChild(container);

    mediaLink.addEventListener("click", () => recordEvent(ad.id, "click"));
    closeButton.addEventListener("click", closePopup);

    document.body.appendChild(overlay);
    popupElement = overlay;

    requestAnimationFrame(() => overlay.classList.add("visible"));

    recordEvent(ad.id, "impression");

    const delay = Math.min(30, Math.max(10, Number(ad.close_after_seconds) || 12));

    closeTimer = setTimeout(() => {
      if (!closeButton || !popupElement) return;
      closeButton.hidden = false;
      closeButton.focus();
    }, delay * 1000);

    LOG(`showing "${ad.title}" - close button appears in ${delay}s`);
  }

  function closePopup() {
    if (!popupElement || !currentAd) return;
    if (closeButton?.hidden) return;

    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    recordEvent(currentAd.id, "close");

    const oldPopup = popupElement;
    oldPopup.classList.remove("visible");
    setTimeout(() => oldPopup.remove(), 250);

    popupElement = null;
    closeButton = null;
    currentAd = null;
  }

  // ---------------------------------------------------
  // REQUEST
  // ---------------------------------------------------
  async function requestNextAd() {
    try {
      const response = await fetch(`${API}/next`, {
        method: "GET",
        headers: getHeaders(),
        credentials: "same-origin",
      });

      if (!response.ok) {
        LOG("server answered", response.status);
        return;
      }

      const result = await response.json();

      if (!result.ad) {
        LOG("server returned no ad (see the [ads] line in the server terminal for the reason)");
        return;
      }

      const ad = result.ad;

      if (
        !ad.id ||
        !getSafeUrl(ad.media_url) ||
        !getSafeUrl(ad.destination_url) ||
        !["image", "video"].includes(ad.media_type)
      ) {
        console.warn("[ads] invalid advertisement received:", ad);
        return;
      }

      currentAd = ad;
      createPopup(ad);
    } catch (error) {
      console.warn("[ads] request failed:", error);
    }
  }

  // ---------------------------------------------------
  // START
  // ---------------------------------------------------
  function startAdManager() {
    LOG("loaded on", location.pathname);

    if (!canDisplayAds()) return;

    function tryDisplay() {
      if (!canDisplayAds()) return;

      if (pageIsBusy()) {
        LOG("page busy - retrying in 10s");
        setTimeout(tryDisplay, 10000);
        return;
      }

      requestNextAd();
    }

    setTimeout(tryDisplay, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAdManager, { once: true });
  } else {
    startAdManager();
  }
})();