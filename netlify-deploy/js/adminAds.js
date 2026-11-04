// adminAds.js
// Controls the ScientiaForge advertisement management page.
// Requires adminGuard.js and the existing AdminAPI helper.

let adsCampaigns = [];
let adsOverview = null;

const adsNumber = (value) => Number(value || 0).toLocaleString("en-ZA");

function adsElement(id) {
  return document.getElementById(id);
}

function adsEscape(value) {
  if (typeof escapeHtml === "function") {
    return escapeHtml(String(value ?? ""));
  }

  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function adsDate(value) {
  if (!value) return "Not scheduled";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function adsLocalDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16);
}

function adsShowToast(message, type = "success") {
  if (typeof showToast === "function") {
    showToast(message, type);
  } else {
    alert(message);
  }
}

// -------------------------------------------------------
// LOAD OVERVIEW
// -------------------------------------------------------

async function loadAdsOverview() {
  try {
    const result = await AdminAPI.get("/ads/admin/overview");

    adsOverview = result;
    adsCampaigns = result.ads || [];

    renderAdsStats(result.stats || {});
    renderAdsSettings(result.settings || {});
    renderAdsDaily(result.daily || []);
    renderAdsTable(adsCampaigns);

  } catch (error) {
    console.error("Ads overview error:", error);
    adsShowToast("Could not load advertisement information.", "error");
  }
}

function renderAdsStats(stats) {
  adsElement("adsImpressions").textContent =
    adsNumber(stats.impressions);

  adsElement("adsClicks").textContent =
    adsNumber(stats.clicks);

  adsElement("adsCloses").textContent =
    adsNumber(stats.closes);

  adsElement("adsCtr").textContent =
    `${Number(stats.ctr || 0).toFixed(2)}%`;

  adsElement("adsUniqueUsers").textContent =
    adsNumber(stats.unique_users);

  adsElement("adsActiveCount").textContent =
    adsNumber(stats.active_ads);

  adsElement("adsTotalCount").textContent =
    adsNumber(stats.total_ads);
}

function renderAdsSettings(settings) {
  adsElement("adsEnabled").checked =
    settings.enabled !== false;

  adsElement("adsInterval").value =
    Number(settings.interval_minutes || 15);
}

// -------------------------------------------------------
// DAILY PERFORMANCE
// -------------------------------------------------------

function renderAdsDaily(days) {
  const container = adsElement("adsDailyPerformance");

  if (!days.length) {
    container.innerHTML =
      '<div class="table-empty">No advertising activity recorded yet.</div>';
    return;
  }

  const recentDays = [...days].slice(-14).reverse();

  const maxValue = Math.max(
    1,
    ...recentDays.map((day) =>
      Math.max(day.impressions, day.clicks, day.closes)
    )
  );

  container.innerHTML = recentDays.map((day) => {
    const impressionWidth =
      (day.impressions / maxValue) * 100;

    const clickWidth =
      (day.clicks / maxValue) * 100;

    const closeWidth =
      (day.closes / maxValue) * 100;

    return `
      <div class="ads-day-row">
        <div class="ads-day-date">
          ${adsEscape(day.date)}
        </div>

        <div class="ads-day-bars">
          <div class="ads-bar-line">
            <span>Impressions</span>
            <div class="ads-bar-track">
              <div class="ads-bar impressions" style="width:${impressionWidth}%"></div>
            </div>
            <strong>${adsNumber(day.impressions)}</strong>
          </div>

          <div class="ads-bar-line">
            <span>Clicks</span>
            <div class="ads-bar-track">
              <div class="ads-bar clicks" style="width:${clickWidth}%"></div>
            </div>
            <strong>${adsNumber(day.clicks)}</strong>
          </div>

          <div class="ads-bar-line">
            <span>Closes</span>
            <div class="ads-bar-track">
              <div class="ads-bar closes" style="width:${closeWidth}%"></div>
            </div>
            <strong>${adsNumber(day.closes)}</strong>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// -------------------------------------------------------
// CAMPAIGN TABLE
// -------------------------------------------------------

function renderAdsTable(ads) {
  const tbody = adsElement("adsTableBody");

  if (!ads.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty">
          No advertisements created yet. Create your first campaign.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = ads.map((ad) => {
    const schedule = [
      ad.starts_at ? `Starts: ${adsDate(ad.starts_at)}` : "Starts immediately",
      ad.ends_at ? `Ends: ${adsDate(ad.ends_at)}` : "No end date",
    ].join("<br>");

    return `
      <tr data-ad-id="${adsEscape(ad.id)}">

        <td>
          <div class="ads-campaign-cell">
            <div class="ads-campaign-thumbnail">
              ${
                ad.media_type === "video"
                  ? '<i data-lucide="video"></i>'
                  : '<i data-lucide="image"></i>'
              }
            </div>

            <div>
              <strong>${adsEscape(ad.title)}</strong>
              <small>${adsEscape(ad.media_type.toUpperCase())}</small>
            </div>
          </div>
        </td>

        <td>${adsEscape(ad.media_type)}</td>

        <td class="ads-schedule-cell">${schedule}</td>

        <td>
          <span class="ads-status ${ad.is_active ? "active" : "inactive"}">
            ${ad.is_active ? "Active" : "Inactive"}
          </span>
        </td>

        <td>
          <div class="ads-actions">
            <button
              type="button"
              class="ads-action-btn"
              data-action="edit"
              data-id="${adsEscape(ad.id)}"
              title="Edit advertisement"
            >
              <i data-lucide="pencil"></i>
            </button>

            <button
              type="button"
              class="ads-action-btn"
              data-action="toggle"
              data-id="${adsEscape(ad.id)}"
              title="${ad.is_active ? "Deactivate" : "Activate"} advertisement"
            >
              <i data-lucide="${ad.is_active ? "pause" : "play"}"></i>
            </button>

            <button
              type="button"
              class="ads-action-btn danger"
              data-action="delete"
              data-id="${adsEscape(ad.id)}"
              title="Delete advertisement"
            >
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>

      </tr>
    `;
  }).join("");

  if (window.lucide) {
    lucide.createIcons();
  }
}

// -------------------------------------------------------
// MODAL
// -------------------------------------------------------

function openAdsModal(ad = null) {
  const form = adsElement("adsForm");

  form.reset();

  adsElement("adsEditId").value = ad?.id || "";
  adsElement("adsMediaUrl").value = ad?.media_url || "";
  adsElement("adsMediaPath").value = ad?.media_path || "";

  adsElement("adsTitle").value = ad?.title || "";
  adsElement("adsDestination").value = ad?.destination_url || "";

  adsElement("adsCloseDelay").value =
    String(ad?.close_after_seconds || 12);

  adsElement("adsCampaignStatus").value =
    String(ad ? ad.is_active : true);

  adsElement("adsStartsAt").value =
    adsLocalDate(ad?.starts_at);

  adsElement("adsEndsAt").value =
    adsLocalDate(ad?.ends_at);

  adsElement("adsModalTitle").textContent =
    ad ? "Edit Advertisement" : "Create Advertisement";

  adsElement("saveAdBtn").textContent =
    ad ? "Update Advertisement" : "Save Advertisement";

  renderAdsMediaPreview(ad?.media_url, ad?.media_type);

  adsElement("adsModal").classList.add("open");
}

function closeAdsModal() {
  adsElement("adsModal").classList.remove("open");
}

function renderAdsMediaPreview(url, type) {
  const preview = adsElement("adsMediaPreview");

  if (!url) {
    preview.innerHTML = "<span>No media selected</span>";
    return;
  }

  if (type === "video") {
    preview.innerHTML = `
      <video controls src="${adsEscape(url)}"></video>
    `;
  } else {
    preview.innerHTML = `
      <img src="${adsEscape(url)}" alt="Advertisement preview">
    `;
  }
}

// -------------------------------------------------------
// MEDIA UPLOAD
// -------------------------------------------------------

async function uploadAdsMedia(file) {
  if (!file) return null;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Unsupported image or video format.");
  }

  if (file.size <= 0 || file.size > 50 * 1024 * 1024) {
    throw new Error("The file must be smaller than 50 MB.");
  }

  // Ask the backend for a signed upload URL.
  const uploadInfo = await AdminAPI.post(
    "/ads/admin/upload-url",
    {
      file_name: file.name,
      content_type: file.type,
      file_size: file.size,
    }
  );

  if (!uploadInfo.signed_url || !uploadInfo.token) {
    throw new Error("The server did not return a valid upload URL.");
  }

  // Upload directly to Supabase Storage.
  const response = await fetch(uploadInfo.signed_url, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("Storage upload error:", message);
    throw new Error("The media upload failed.");
  }

  return {
    media_url: uploadInfo.public_url,
    media_path: uploadInfo.path,
    media_type: file.type.startsWith("video/")
      ? "video"
      : "image",
  };
}

// -------------------------------------------------------
// SAVE CAMPAIGN
// -------------------------------------------------------

async function saveAdsCampaign(event) {
  event.preventDefault();

  const saveButton = adsElement("saveAdBtn");
  const originalText = saveButton.textContent;

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    const editId = adsElement("adsEditId").value;
    const file = adsElement("adsMediaFile").files[0];

    let mediaUrl = adsElement("adsMediaUrl").value;
    let mediaPath = adsElement("adsMediaPath").value;

    let mediaType = "image";

    if (editId) {
      const existing = adsCampaigns.find((ad) => ad.id === editId);
      mediaType = existing?.media_type || "image";
    }

    if (file) {
      const uploaded = await uploadAdsMedia(file);

      mediaUrl = uploaded.media_url;
      mediaPath = uploaded.media_path;
      mediaType = uploaded.media_type;
    }

    if (!mediaUrl) {
      throw new Error("Please upload an image or video.");
    }

    const destination = adsElement("adsDestination").value.trim();

    const destinationUrl = new URL(destination);

    if (destinationUrl.protocol !== "https:") {
      throw new Error("The destination URL must use HTTPS.");
    }

    const startsValue = adsElement("adsStartsAt").value;
    const endsValue = adsElement("adsEndsAt").value;

    const payload = {
      title: adsElement("adsTitle").value.trim(),
      media_type: mediaType,
      media_url: mediaUrl,
      media_path: mediaPath,
      destination_url: destination,
      close_after_seconds: Number(
        adsElement("adsCloseDelay").value
      ),
      is_active:
        adsElement("adsCampaignStatus").value === "true",
      starts_at: startsValue
        ? new Date(startsValue).toISOString()
        : null,
      ends_at: endsValue
        ? new Date(endsValue).toISOString()
        : null,
    };

    if (
      payload.starts_at &&
      payload.ends_at &&
      new Date(payload.ends_at) <= new Date(payload.starts_at)
    ) {
      throw new Error("The end date must be after the start date.");
    }

    if (editId) {
      await AdminAPI.put(`/ads/admin/${editId}`, payload);
      adsShowToast("Advertisement updated successfully.");
    } else {
      await AdminAPI.post("/ads/admin", payload);
      adsShowToast("Advertisement created successfully.");
    }

    closeAdsModal();
    await loadAdsOverview();

  } catch (error) {
    console.error("Save advertisement error:", error);
    adsShowToast(error.message || "Could not save advertisement.", "error");

  } finally {
    saveButton.disabled = false;
    saveButton.textContent = originalText;
  }
}

// -------------------------------------------------------
// CAMPAIGN ACTIONS
// -------------------------------------------------------

async function toggleAdsCampaign(id) {
  const ad = adsCampaigns.find((item) => item.id === id);

  if (!ad) return;

  try {
    const payload = {
      title: ad.title,
      media_type: ad.media_type,
      media_url: ad.media_url,
      media_path: ad.media_path,
      destination_url: ad.destination_url,
      close_after_seconds: ad.close_after_seconds,
      is_active: !ad.is_active,
      starts_at: ad.starts_at,
      ends_at: ad.ends_at,
    };

    await AdminAPI.put(`/ads/admin/${id}`, payload);

    adsShowToast(
      payload.is_active
        ? "Advertisement activated."
        : "Advertisement deactivated."
    );

    await loadAdsOverview();

  } catch (error) {
    console.error(error);
    adsShowToast("Could not update advertisement status.", "error");
  }
}

async function deleteAdsCampaign(id) {
  const ad = adsCampaigns.find((item) => item.id === id);

  if (!ad) return;

  const confirmed = confirm(
    `Delete "${ad.title}"? This will permanently remove the campaign and its recorded events.`
  );

  if (!confirmed) return;

  try {
    const token = localStorage.getItem("sb-access-token");

    const response = await fetch(`/api/ads/admin/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Could not delete advertisement.");
    }

    adsShowToast("Advertisement deleted.");
    await loadAdsOverview();

  } catch (error) {
    console.error(error);
    adsShowToast(error.message || "Could not delete advertisement.", "error");
  }
}

// -------------------------------------------------------
// GLOBAL SETTINGS
// -------------------------------------------------------

async function saveAdsSettings() {
  const button = adsElement("saveAdsSettingsBtn");

  const enabled = adsElement("adsEnabled").checked;
  const interval = Number(adsElement("adsInterval").value);

  if (!Number.isInteger(interval) || interval < 5 || interval > 1440) {
    adsShowToast("Enter a frequency between 5 and 1440 minutes.", "error");
    return;
  }

  button.disabled = true;

  try {
    await AdminAPI.put("/ads/admin/settings", {
      enabled,
      interval_minutes: interval,
    });

    adsShowToast("Advertising settings saved.");

  } catch (error) {
    console.error(error);
    adsShowToast("Could not save advertising settings.", "error");

  } finally {
    button.disabled = false;
  }
}

// -------------------------------------------------------
// EVENT LISTENERS
// -------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  const me = await adminReady;

  if (!me) return;

  await loadAdsOverview();

  adsElement("createAdBtn").addEventListener("click", () => {
    openAdsModal();
  });

  adsElement("closeAdsModal").addEventListener("click", closeAdsModal);
  adsElement("cancelAdsBtn").addEventListener("click", closeAdsModal);

  adsElement("adsForm").addEventListener("submit", saveAdsCampaign);

  adsElement("saveAdsSettingsBtn").addEventListener("click", saveAdsSettings);

  adsElement("refreshAdsBtn").addEventListener("click", loadAdsOverview);

  adsElement("adsMediaFile").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (!file) return;

    const preview = adsElement("adsMediaPreview");
    const temporaryUrl = URL.createObjectURL(file);

    if (file.type.startsWith("video/")) {
      preview.innerHTML = `<video controls src="${temporaryUrl}"></video>`;
    } else {
      preview.innerHTML = `<img src="${temporaryUrl}" alt="Selected advertisement">`;
    }
  });

  // Handle edit, activate/deactivate and delete buttons.
  adsElement("adsTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit") {
      const ad = adsCampaigns.find((item) => item.id === id);
      if (ad) openAdsModal(ad);
    }

    if (action === "toggle") {
      await toggleAdsCampaign(id);
    }

    if (action === "delete") {
      await deleteAdsCampaign(id);
    }
  });
});