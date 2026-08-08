document.addEventListener('DOMContentLoaded', () => {

// skillGap.js

    const API_BASE = "https://localhost:5001/api"; // adjust to your port

    // ================= FETCH USER SKILLS =================
    async function fetchUserSkills() {
    const res = await fetch(`${API_BASE}/user/skills`);
    return await res.json();
    }

    // ================= FETCH JOBS =================
    async function fetchJobs() {
    const res = await fetch(`${API_BASE}/jobs`);
    return await res.json();
    }

    // ================= CALL SKILL GAP API =================
    async function getSkillGap(userSkills, jobId) {
    const res = await fetch(`${API_BASE}/skillgap`, {
        method: "POST",
        headers: {
        "Content-Type": "application/json"
        },
        body: JSON.stringify({
        userSkills: userSkills.map(s => s.name), // normalize
        jobId: jobId
        })
    });

    return await res.json();
    }

    // ================= INITIALIZE PAGE =================
    async function initSkillGap() {
    const jobSelect = document.querySelector(".job-select");

    const jobs = await fetchJobs();
    const userSkills = await fetchUserSkills();

    // Populate dropdown
    jobs.forEach(job => {
        const option = document.createElement("option");
        option.value = job.id;
        option.textContent = job.title;
        jobSelect.appendChild(option);
    });

    // On job change
    jobSelect.addEventListener("change", async () => {
        const jobId = parseInt(jobSelect.value);

        const result = await getSkillGap(userSkills, jobId);

        updateUI(result);
    });
    }

    // ================= UPDATE UI =================
    function updateUI(data) {
    const { have, missing, matchScore } = data;

    document.getElementById("matchScore").textContent = matchScore + "%";
    document.getElementById("haveCount").textContent = have.length;
    document.getElementById("missingCount").textContent = missing.length;

    const haveContainer = document.getElementById("haveSkills");
    const missingContainer = document.getElementById("missingSkills");

    haveContainer.innerHTML = "";
    missingContainer.innerHTML = "";

    have.forEach(skill => {
        const span = document.createElement("span");
        span.textContent = skill;
        haveContainer.appendChild(span);
    });

    missing.forEach(skill => {
        const span = document.createElement("span");
        span.textContent = skill;
        missingContainer.appendChild(span);
    });
    }

    // ================= RUN =================
    initSkillGap();
});