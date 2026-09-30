document.addEventListener('DOMContentLoaded', () => {

  const API_BASE = "http://localhost:5001/api";

  let currentSkills = [];   // [{skill_id, name, level, ...}]
  let currentJobId = null;

  // ================= AUTH HEADER HELPER =================
  function getAuthHeaders(extra = {}) {
    const token = localStorage.getItem("sb-access-token");

    if (!token) {
      window.location.href = "LogIn.html";
      return extra;
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

  // ================= FETCH JOBS =================
  async function fetchJobs() {
    const res = await fetch(`${API_BASE}/jobs`);
    if (!res.ok) throw new Error("Failed to load jobs.");
    const data = await res.json();
    return data.jobs || [];
  }

  // ================= CALL SKILL GAP API =================
  async function getSkillGap(skillNames, jobId) {
    const res = await fetch(`${API_BASE}/skillgap`, {
      method: "POST",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ userSkillNames: skillNames, jobId }),
    });
    if (!res.ok) throw new Error("Failed to compute skill gap.");
    return await res.json();
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

  // ================= RENDER: MAIN PAGE =================
  function renderHaveSkills() {
    const container = document.getElementById("haveSkills");
    container.innerHTML = "";
    currentSkills.forEach((skill) => {
      const item = document.createElement("span");
      item.className = "skill-item";
      item.innerHTML = `<i data-lucide="check" class="skill-icon has"></i>${skill.name}`;
      container.appendChild(item);
    });
    lucide.createIcons();
  }

  function renderGapResult(result) {
    const { have, missing, matchScore } = result;

    document.getElementById("matchScore").textContent = matchScore + "%";
    document.getElementById("haveCount").textContent = have.length;
    document.getElementById("missingCount").textContent = missing.length;

    const missingContainer = document.getElementById("missingSkills");
    missingContainer.innerHTML = "";
    missing.forEach((skill) => {
      const item = document.createElement("span");
      item.className = "skill-item";
      item.innerHTML = `<i data-lucide="x" class="skill-icon missing"></i>${skill}`;
      missingContainer.appendChild(item);
    });
    lucide.createIcons();
  }

  async function refreshGapForCurrentJob() {
    if (!currentJobId) return;
    const skillNames = currentSkills.map((s) => s.name);
    const result = await getSkillGap(skillNames, currentJobId);
    renderGapResult(result);
  }

// ================= MODAL =================
 // const overlay = document.getElementById("skillsModalOverlay");
  const modalList = document.getElementById("modalSkillsList");
  const newSkillInput = document.getElementById("newSkillInput");

    const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
 
  /* ================= SIDEBAR ================= */
 
  function openSidebar() {
    sidebar.classList.add("open");
    overlay?.classList.add("visible");
    menuBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
  }
 
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay?.classList.remove("visible");
    menuBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
  }
 
  if (menuBtn && sidebar) {
 
    menuBtn.addEventListener("click", () => {
      sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
    });
 
    overlay?.addEventListener("click", closeSidebar);
 
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

  // ================= INITIALIZE PAGE =================
  async function initSkillGap() {
    const jobSelect = document.querySelector(".job-select");

    try {
      const [jobs, skills] = await Promise.all([
        fetchJobs(),
        fetchUserSkills(),
      ]);

      currentSkills = skills;
      renderHaveSkills();

      jobSelect.innerHTML = "";
      jobs.forEach((job) => {
        const option = document.createElement("option");
        option.value = job.id;
        option.textContent = job.title;
        jobSelect.appendChild(option);
      });

      if (jobs.length > 0) {
        currentJobId = jobs[0].id;
        await refreshGapForCurrentJob();
      }

      jobSelect.addEventListener("change", async () => {
        currentJobId = parseInt(jobSelect.value, 10);
        await refreshGapForCurrentJob();
      });

    } catch (err) {
      console.error("Skill Gap init error:", err);
      alert(err.message || "Failed to load Skill Gap Analysis.");
    }
  }

  initSkillGap();
});