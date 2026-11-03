document.addEventListener('DOMContentLoaded', () => {

  const API_BASE = "/api";

  let currentSkills = [];   // [{skill_id, name, level, ...}]
  let currentJobId = null;

  // ================= AUTH HEADER HELPER =================
function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem("sb-access-token");

  console.log("Skill Gap token exists:", Boolean(token));

  if (!token) {
    throw new Error(
      "No login token found under sb-access-token. Log in again or fix the login token storage."
    );
  }

  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}

  // ================= FETCH USER SKILLS =================
  async function fetchUserSkills() {
    const res = await fetch(`${API_BASE}/skills/me`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load your skills.");
    const data = await res.json();
    return data.skills || [];
  }

  // ================= FETCH Industries =================

  async function fetchIndustries() {
    const res = await fetch(`${API_BASE}/industries`);
    if (!res.ok) throw new Error("Failed to load industries.");
    const data = await res.json();
    return data.industries || [];
  }

  async function fetchCareersForIndustry(industryId) {
    const res = await fetch(`${API_BASE}/industries/${industryId}/careers`);
    if (!res.ok) throw new Error("Failed to load careers.");
    const data = await res.json();
    return data.careers || [];
  }
  // ================= FETCH JOBS =================
  
  async function fetchJobs(queryText) {
    const url = new URL(`${API_BASE}/jobs`);
    if (queryText) {
      url.searchParams.set("q", queryText);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to load jobs.");
    }

    const data = await res.json();
    return data.jobs || [];
  }

  // ================= CALL SKILL GAP API =================

  async function getSkillGap(skillNames, jobId) {
    const res = await fetch(`${API_BASE}/skillgap`, {
      method: "POST",
      headers: getAuthHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        userSkillNames: skillNames,
        jobId,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Failed to compute skill gap.");
    }

    return data;
  }

  // ================= ADD / REMOVE SKILL =================
  async function addSkill(name) {
    const res = await fetch(`${API_BASE}/skills/me`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to add skill.");
    }
  }

  async function removeSkill(skillId) {
    const res = await fetch(`${API_BASE}/skills/me/${skillId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error("Failed to remove skill.");
  }


  //================== RENDER: HAVE SKILLS (TRUNCATED) =================
  let fullHaveSkills = [];     // all matched skills for this career
  let fullMissingSkills = [];  // all required skills for this career
  
  const ITEMS_PER_ROW_ESTIMATE = 6; // adjust based on your layout
  const MAX_VISIBLE_ITEMS = ITEMS_PER_ROW_ESTIMATE * 5; // ~5 rows

  function renderHaveSkills() {
    const container = document.getElementById("haveSkills");
    container.innerHTML = "";

    fullHaveSkills = currentSkills
      .filter((s) => /* optionally filter to skills relevant to this career */ true)
      .map((s) => s.name);

    const visible = fullHaveSkills.slice(0, MAX_VISIBLE_ITEMS);

    visible.forEach((skillName) => {
      const item = document.createElement("span");
      item.className = "skill-item";
      item.innerHTML = `<i data-lucide="check" class="skill-icon has"></i>${skillName}`;
      container.appendChild(item);
    });

    if (fullHaveSkills.length > MAX_VISIBLE_ITEMS) {
      container.classList.add("truncated");
    } else {
      container.classList.remove("truncated");
    }

    lucide.createIcons();
  }

  function renderGapResult(result) {
    const { have, missing, matchScore } = result;

    document.getElementById("matchScore").textContent = matchScore + "%";
    document.getElementById("haveCount").textContent = have.length;
    document.getElementById("missingCount").textContent = missing.length;

    // Store full lists
    fullHaveSkills = have;
    fullMissingSkills = missing;

    // Render visible missing skills (truncated)
    const missingContainer = document.getElementById("missingSkills");
    missingContainer.innerHTML = "";

    const visibleMissing = fullMissingSkills.slice(0, MAX_VISIBLE_ITEMS);

    visibleMissing.forEach((skill) => {
      const item = document.createElement("span");
      item.className = "skill-item";
      item.innerHTML = `<i data-lucide="x" class="skill-icon missing"></i>${skill}`;
      missingContainer.appendChild(item);
    });

    if (fullMissingSkills.length > MAX_VISIBLE_ITEMS) {
      missingContainer.classList.add("truncated");
    } else {
      missingContainer.classList.remove("truncated");
    }

    lucide.createIcons();
  }


  function showHaveLoading() {
    const list = document.getElementById("haveSkills");
    const loader = document.getElementById("haveSkillsLoading");

    if (list) list.innerHTML = "";
    if (loader) loader.style.display = "flex";
  }

  function hideHaveLoading() {
    const loader = document.getElementById("haveSkillsLoading");
    if (loader) loader.style.display = "none";
  }

  function showMissingLoading() {
    const list = document.getElementById("missingSkills");
    const loader = document.getElementById("missingSkillsLoading");

    if (list) list.innerHTML = "";
    if (loader) loader.style.display = "flex";
  }

  function hideMissingLoading() {
    const loader = document.getElementById("missingSkillsLoading");
    if (loader) loader.style.display = "none";
  }


  async function refreshGapForCurrentJob() {
    if (!currentJobId) {
      clearGapResult();
      return;
    }

    const skillNames = currentSkills.map((s) => s.name);
    const result = await getSkillGap(skillNames, currentJobId);

    renderGapResult(result);

    // Generate roadmap based on missing skills
    await loadRoadmap(result.missing);
  }

  let roadmapRequestId = 0;

  function roadmapElement(tag, text, className) {
    const element = document.createElement(tag);

    if (text != null) {
      element.textContent = text;
    }

    if (className) {
      element.className = className;
    }

    return element;
  }

  async function loadRoadmap(missingSkills) {
    const requestId = ++roadmapRequestId;
    const container = document.querySelector(".roadmap-items");

    if (!container) return;

    container.setAttribute("aria-busy", "true");
    container.replaceChildren(
      roadmapElement("p", "Preparing your learning roadmap…")
    );

    try {
      const response = await fetch(`${API_BASE}/roadmap`, {
        method: "POST",
        headers: getAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ missingSkills }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Could not load the roadmap.");
      }

      if (requestId !== roadmapRequestId) return;

      renderRoadmap(data);
    } catch (error) {
      if (requestId !== roadmapRequestId) return;

      console.error("[Roadmap]", error);

      const message = roadmapElement(
        "p",
        error.message,
        "roadmap-error"
      );
      message.setAttribute("role", "alert");

      const retry = roadmapElement("button", "Try again");
      retry.type = "button";
      retry.addEventListener("click", () => {
        loadRoadmap(missingSkills);
      });

      container.replaceChildren(message, retry);
    } finally {
      if (requestId === roadmapRequestId) {
        container.setAttribute("aria-busy", "false");
      }
    }
  }

  function renderRoadmap(data) {
    const container = document.querySelector(".roadmap-items");

    if (!container) return;

    container.replaceChildren();

    const roadmap = data.roadmap || [];
    const otherSkills = data.otherSkills || [];
    const summary = data.summary || {};

    if (summary.totalMissingSkills === 0) {
      container.appendChild(
        roadmapElement(
          "p",
          "No missing essential skills were identified by the current matcher.",
          "roadmap-summary"
        )
      );

      container.appendChild(
        roadmapElement(
          "p",
          "This comparison is based on the skills in your profile, not a formal assessment of competence.",
          "roadmap-note"
        )
      );

      return;
    }

    container.appendChild(
      roadmapElement(
        "p",
        `${summary.totalMissingSkills} essential skills to develop for this career.`,
        "roadmap-summary"
      )
    );

    container.appendChild(
      roadmapElement(
        "p",
        "These recommendations reflect the gap between your profile and the selected career's ESCO essential requirements. Group order is guidance, not an official skill ranking.",
        "roadmap-note"
      )
    );

    roadmap.forEach((area, index) => {
      const card = roadmapElement(
        "article",
        null,
        "roadmap-card"
      );

      card.append(
        roadmapElement(
          "p",
          `Development area ${index + 1} · ${area.stage}`,
          "roadmap-stage"
        ),
        roadmapElement("h4", area.title),
        roadmapElement("p", area.description),
        roadmapElement("h5", "Skills to acquire")
      );

      const skills = roadmapElement(
        "ul",
        null,
        "roadmap-skill-list"
      );

      for (const skill of area.skillsToAcquire || []) {
        skills.appendChild(
          roadmapElement("li", skill)
        );
      }

      card.appendChild(skills);

      if (area.suggestedAction) {
        const action = document.createElement("details");

        action.append(
          roadmapElement("summary", "Suggested development action"),
          roadmapElement("p", area.suggestedAction)
        );

        card.appendChild(action);
      }

      if (area.note) {
        card.appendChild(
          roadmapElement(
            "p",
            area.note,
            "roadmap-note"
          )
        );
      }

      container.appendChild(card);
    });

    if (otherSkills.length) {
      const section = roadmapElement(
        "section",
        null,
        "roadmap-card"
      );

      section.appendChild(
        roadmapElement(
          "h4",
          roadmap.length
            ? "Other skills to develop"
            : "Skills to develop"
        )
      );

      section.appendChild(
        roadmapElement(
          "p",
          "These are also missing essential requirements. They are listed individually rather than grouped into development areas.",
          "roadmap-note"
        )
      );

      const list = roadmapElement(
        "ul",
        null,
        "roadmap-skill-list"
      );

      for (const skill of otherSkills) {
        list.appendChild(
          roadmapElement("li", skill)
        );
      }

      section.appendChild(list);
      container.appendChild(section);
    }
  }

  //================== MODAL: VIEW ALL HAVE / MISSING SKILLS =================

  const allHaveSkillsModal = document.getElementById("allHaveSkillsModal");
  const allMissingSkillsModal = document.getElementById("allMissingSkillsModal");
  const allHaveSkillsList = document.getElementById("allHaveSkillsList");
  const allMissingSkillsList = document.getElementById("allMissingSkillsList");

  document.getElementById("viewAllHaveLink").addEventListener("click", () => {
    allHaveSkillsList.innerHTML = "";
    fullHaveSkills.forEach((skill) => {
      const pill = document.createElement("span");
      pill.className = "modal-skill-pill matched";
      pill.textContent = skill;
      allHaveSkillsList.appendChild(pill);
    });
    allHaveSkillsModal.classList.add("open");
  });

  document.getElementById("viewAllMissingLink").addEventListener("click", () => {
    allMissingSkillsList.innerHTML = "";
    fullMissingSkills.forEach((skill) => {
      const pill = document.createElement("span");
      pill.className = "modal-skill-pill missing";
      pill.textContent = skill;
      allMissingSkillsList.appendChild(pill);
    });
    allMissingSkillsModal.classList.add("open");
  });

  // Close modal buttons
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.getAttribute("data-close-modal");
      document.getElementById(modalId).classList.remove("open");
    });
  });

  // Close on overlay click
  [allHaveSkillsModal, allMissingSkillsModal].forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("open");
      }
    });
  });

  async function refreshGapForCurrentJob() {
    if (!currentJobId) {
      clearGapResult();
      return;
    }

    showMissingLoading();

    try {
      const skillNames = currentSkills.map((s) => s.name);
      const result = await getSkillGap(skillNames, currentJobId);

      renderGapResult(result);
      await loadRoadmap(result.missing);
    } catch (err) {
      console.error("Error refreshing skill gap:", err);

      clearGapResult();

      const missingContainer = document.getElementById("missingSkills");

      if (missingContainer) {
        const message = document.createElement("p");
        message.className = "skill-load-error";
        message.setAttribute("role", "alert");
        message.textContent = err.message;
        missingContainer.replaceChildren(message);
      }

      const roadmapContainer = document.querySelector(".roadmap-items");

      if (roadmapContainer) {
        roadmapContainer.textContent =
          "The learning roadmap will be available once career skills load.";
      }

    } finally {
      hideMissingLoading();
    }
  }

// ================= MODAL =================

  const overlay = document.getElementById("skillsModalOverlay");
  const modalList = document.getElementById("modalSkillsList");
  const newSkillInput = document.getElementById("newSkillInput");

    const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const overlayy = document.getElementById("sidebarOverlay");
 
  /* ================= SIDEBAR ================= */
 
  function openSidebar() {
    sidebar.classList.add("open");
    overlayy?.classList.add("visible");
    menuBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
  }
 
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlayy?.classList.remove("visible");
    menuBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
  }
 
  if (menuBtn && sidebar) {
 
    menuBtn.addEventListener("click", () => {
      sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });
 
    overlayy?.addEventListener("click", closeSidebar);
 
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sidebar.classList.contains("open")) {
        closeSidebar();
      }
    });
 
    // close the drawer when a nav link is tapped on mobile
    sidebar.querySelectorAll(".nav-item").forEach(link => {
      link.addEventListener("click", () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    });
 
    // if the viewport grows back to desktop, reset state
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) closeSidebar();
    });
 
  }

  async function loadUserGreeting() {
  // Get the token saved after login
  const token = localStorage.getItem("sb-access-token");
  if (!token) return window.location.href = "/pages/LogIn.html";
 
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
 
    if (!res.ok) return window.location.href = "/pages/LogIn.html";
 
    const { firstName, email } = await res.json();

    document.querySelector(".profile-name").textContent = firstName;
    document.querySelector(".profile-email").textContent = email;
  } catch (err) {
    console.error("Failed to load user:", err);
  }
}
 
loadUserGreeting();
  











  

  function renderModalSkills() {
    modalList.innerHTML = "";
    currentSkills.forEach((skill) => {
      const pill = document.createElement("span");
      pill.className = "modal-pill";
      pill.innerHTML = `${skill.name} <span class="remove-x" data-id="${skill.skill_id}">&times;</span>`;
      modalList.appendChild(pill);
    });
  }

  function openModal() {
    renderModalSkills();
    overlay.classList.add("open");
  }

  function closeModal() {
    overlay.classList.remove("open");
    newSkillInput.value = "";
  }

  // Commits whatever's typed in the input, if anything. Returns true if it added something.
  async function commitPendingSkill() {
    const name = newSkillInput.value.trim();
    if (!name) return false;

    try {
      await addSkill(name);
      currentSkills = await fetchUserSkills();
      newSkillInput.value = "";
      renderModalSkills();
      renderHaveSkills();
      await refreshGapForCurrentJob();
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    }
  }

  document.getElementById("editSkillsBtn").addEventListener("click", openModal);

  document.getElementById("closeSkillsModal").addEventListener("click", async () => {
    await commitPendingSkill();
    closeModal();
  });

  document.getElementById("doneSkillsBtn").addEventListener("click", async () => {
    await commitPendingSkill();
    closeModal();
  });

  overlay.addEventListener("click", async (e) => {
    if (e.target !== overlay) return;
    closeModal();
  });

  modalList.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("remove-x")) return;
    const skillId = e.target.getAttribute("data-id");

    try {
      await removeSkill(skillId);
      currentSkills = currentSkills.filter((s) => s.skill_id !== skillId);
      renderModalSkills();
      renderHaveSkills();
      await refreshGapForCurrentJob();
    } catch (err) {
      alert(err.message);
    }
  });

  newSkillInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    await commitPendingSkill();
  });

  function clearGapResult() {
    document.getElementById("matchScore").textContent = "–";
    document.getElementById("haveCount").textContent = "–";
    document.getElementById("missingCount").textContent = "–";
    document.getElementById("missingSkills").innerHTML = "";

    roadmapRequestId++;

    const roadmapContainer = document.querySelector(".roadmap-items");

    if (roadmapContainer) {
      roadmapContainer.setAttribute("aria-busy", "false");
      roadmapContainer.textContent =
        "Select a career to see your learning roadmap.";
    }
  }

  // ================= INITIALIZE PAGE =================

  async function initSkillGap() {
     showHaveLoading();

    try {
      const skills = await fetchUserSkills();
      currentSkills = skills;
      renderHaveSkills();
    } catch (err) {
      console.error("Error loading user skills:", err);
    } finally {
      hideHaveLoading();
    }
    const industrySelect = document.getElementById("industrySelect");
    const jobSelect = document.getElementById("jobSelect");

    try {
      const [industries, skills] = await Promise.all([
        fetchIndustries(),
        fetchUserSkills(),
      ]);

      currentSkills = skills;
      renderHaveSkills();

      // Populate industries
      industrySelect.innerHTML = '<option value="">Select industry…</option>';
      industries.forEach((ind) => {
        const option = document.createElement("option");
        option.value = ind.id;
        option.textContent = ind.label;
        industrySelect.appendChild(option);
      });

      // When industry changes, load careers
      industrySelect.addEventListener("change", async () => {
        const indId = industrySelect.value;
        jobSelect.innerHTML = '<option value="">Select career…</option>';
        jobSelect.disabled = !indId;

        if (!indId) {
          currentJobId = null;
          clearGapResult();
          return;
        }

        const careers = await fetchCareersForIndustry(indId);
        console.log("Industry:", indId, "Careers:", careers);
        careers.forEach((career) => {
          const option = document.createElement("option");
          option.value = career.jobId;
          option.textContent = career.title;
          jobSelect.appendChild(option);
        });

        // Optionally auto-select first career
        if (careers.length > 0) {
          jobSelect.value = careers[0].jobId;
          currentJobId = careers[0].jobId;
          await refreshGapForCurrentJob();
        }
      });

      // When career changes, recompute gap
      jobSelect.addEventListener("change", async () => {
        currentJobId = jobSelect.value;
        if (currentJobId) {
          await refreshGapForCurrentJob();
        } else {
          clearGapResult();
        }
      });

    } catch (err) {
      console.error("Skill Gap init error:", err);
      alert(err.message || "Failed to load Skill Gap Analysis.");
    }
  }

  initSkillGap();
});