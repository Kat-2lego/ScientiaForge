document.addEventListener('DOMContentLoaded', () => {

  const API_BASE = "http://localhost:5001/api";

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
  const overlay = document.getElementById("skillsModalOverlay");
  const modalList = document.getElementById("modalSkillsList");
  const newSkillInput = document.getElementById("newSkillInput");

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
  }
  // ================= INITIALIZE PAGE =================
  async function initSkillGap() {
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