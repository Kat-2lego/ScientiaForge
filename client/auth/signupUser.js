/**
 * SkillForge AI Onboarding & Control Engine
 * Location: ../auth/signupUser.js
 * * Features:
 * - Slide window panel transition mechanisms
 * - Dynamic 10-track Industry mapping arrays
 * - Hybrid Skill Tag selection sets
 * - Real API integration wrapper mapping to http://localhost:5001/api/auth/signup
 */

// Global User Selected Skills Array Store System
let selectedSkillsTags = new Set();

// Taxonomy Data Definition Mapping Object Engine (10 Industries)
const industryDataMap = {
    IT: {
        roles: ["Software Developer", "UI/UX Designer", "Data Analyst", "Cybersecurity Analyst", "QA Tester"],
        skills: ["JavaScript", "Python", "React", "SQL", "Figma", "Git", "Automated Testing"]
    },
    Finance: {
        roles: ["Investment Analyst", "Financial Planner", "Risk Manager", "Accountant", "Quantitative Trader"],
        skills: ["Financial Modeling", "Excel Macros", "Risk Assessment", "Accounting Rules", "Python"]
    },
    RealEstate: {
        roles: ["Real Estate Agent", "Property Manager", "Commercial Broker", "Appraisal Specialist"],
        skills: ["Negotiation", "Property Law", "Market Valuation", "CRM Systems", "Lead Generation"]
    },
    Entrepreneurship: {
        roles: ["Founder/Co-Founder", "Growth Marketer", "Operations Lead", "Business Strategist"],
        skills: ["Lean Startup", "Venture Capital", "Product Strategy", "Growth Hacking", "Agile Execution"]
    },
    Healthcare: {
        roles: ["Clinical Administrator", "Healthcare IT Analyst", "Medical Device Sales", "Lab Manager"],
        skills: ["EHR Systems", "Medical Compliance", "Healthcare Analytics", "B2B Sales"]
    },
    Marketing: {
        roles: ["SEO Specialist", "Content Strategist", "Social Media Manager", "Brand Designer"],
        skills: ["Google Analytics", "SEO Optimization", "Copywriting", "Adobe Creative Suite", "Ad Campaign Management"]
    },
    Management: {
        roles: ["Technical Product Manager", "Scrum Master", "Agile Project Manager", "Operations Manager"],
        skills: ["Product Roadmap", "Scrum framework", "Jira", "Resource Planning", "Stakeholder Management"]
    },
    DataScience: {
        roles: ["Machine Learning Engineer", "Data Scientist", "BI Developer", "Data Architect"],
        skills: ["Python", "TensorFlow", "Deep Learning", "Data Pipelines", "PowerBI", "Tableau"]
    },
    Sales: {
        roles: ["Account Executive", "Customer Success Manager", "Business Development Rep (BDR)"],
        skills: ["Inbound Sales", "Salesforce CRM", "Client Onboarding", "Cold Calling", "Retention Strategy"]
    }
};

/**
 * Slide Control Matrix Engine
 * Shifts the display viewport track wrapper left or right
 */
function goToStep(stepNumber) {
    // 1. Step 1 Validation: Check core credentials before advancing to step 2
    if (stepNumber === 2) {
        const firstNames = document.getElementById("sf-names").value.trim();
        const email = document.getElementById("sf-email").value.trim();
        const password = document.getElementById("sf-pass").value;

        if (!firstNames || !email || !password) {
            alert("Please fill in all fields.");
            return;
        }

        if (password.length < 8) {
            alert("Password must be at least 8 characters.");
            return;
        }
    }
    
    // 2. Step 2 Validation: Check industry and career level selections before advancing to step 3
    if (stepNumber === 3) {
        const industry = document.getElementById('sf-industry').value;
        const experience = document.getElementById('sf-experience').value;

        if (!industry || !experience) {
            alert("Please pick your target industry and experience level to advance.");
            return;
        }
    }

    // 3. Perform the sliding viewport animation transformation
    const targetStrip = document.getElementById('onboardingForm');
    const transformationValue = (stepNumber - 1) * -33.333;
    targetStrip.style.transform = `translateX(${transformationValue}%)`;

    // 4. Cycle the top dashboard step indicator circles classes
    document.querySelectorAll('.step-dot').forEach(dot => {
        const targetDotIndex = parseInt(dot.getAttribute('data-step'));
        if (targetDotIndex === stepNumber) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

/**
 * Monitors Industry Dropdown State Transitions (Populates Step 2 Checkboxes)
 */
function handleIndustryChange() {
    const industryValue = document.getElementById('sf-industry').value;
    const customWrapper = document.getElementById('custom-industry-wrapper');
    const rolesContainer = document.getElementById('roles-dynamic-container');
    
    // Clear out data dependencies
    rolesContainer.innerHTML = "";
    selectedSkillsTags.clear();
    renderSelectedTagPills();

    // Toggle custom text entry row if 'Other' industry is picked
    if (industryValue === 'Other') {
        customWrapper.classList.remove('hidden-element');
        rolesContainer.innerHTML = `
            <div class="field-wrapper" style="grid-column: 1/-1; width: 100%; margin: 0;">
                <input type="text" id="sf-custom-role" placeholder="Type your custom target title role..." class="input" style="margin:0;"/>
            </div>
        `;
        renderSuggestedChips([]);
        return;
    }

    customWrapper.classList.add('hidden-element');

    // Dynamically inject matching checkbox arrays from taxonomy dictionary maps
    const matchData = industryDataMap[industryValue];
    if (matchData) {
        // Build dynamic structural checkbox cards
        matchData.roles.forEach((role) => {
            const lbl = document.createElement('label');
            lbl.className = "checkbox-lbl-item";
            lbl.innerHTML = `
                <input type="checkbox" name="sf_roles" value="${role}">
                <span>${role}</span>
            `;
            rolesContainer.appendChild(lbl);
        });

        // Seed default background skill interest tag lists for Step 3
        renderSuggestedChips(matchData.skills);
    } else {
        rolesContainer.innerHTML = `<p class="form-placeholder-text">Please pick an industry above first...</p>`;
    }
}

/**
 * Handles Background Preset Skill Chip Selections (Step 3)
 */
function renderSuggestedChips(skillsArray) {
    const container = document.getElementById('suggested-chips-container');
    container.innerHTML = "";

    if (skillsArray.length === 0) {
        container.innerHTML = `<p class="form-placeholder-text" style="padding:0;">No suggestions available. Feel free to type anything down below!</p>`;
        return;
    }

    skillsArray.forEach(skill => {
        const btn = document.createElement('button');
        btn.type = "button";
        btn.className = "skill-chip-btn";
        if (selectedSkillsTags.has(skill)) btn.classList.add('selected-pill-active');
        btn.textContent = skill;
        
        btn.onclick = () => {
            if (selectedSkillsTags.has(skill)) {
                selectedSkillsTags.delete(skill);
                btn.classList.remove('selected-pill-active');
            } else {
                selectedSkillsTags.add(skill);
                btn.classList.add('selected-pill-active');
            }
            renderSelectedTagPills();
        };

        container.appendChild(btn);
    });
}

/**
 * Handles Custom Autocomplete Skill Input Text Injection Engine (Step 3)
 */
document.addEventListener("DOMContentLoaded", () => {
    const skillInputField = document.getElementById('sf-skills-autocomplete');
    if (skillInputField) {
        skillInputField.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const processedValue = skillInputField.value.trim();
                if (processedValue && !selectedSkillsTags.has(processedValue)) {
                    selectedSkillsTags.add(processedValue);
                    renderSelectedTagPills();
                    
                    // Match and highlight suggestion button if it matches existing array presets
                    document.querySelectorAll('.skill-chip-btn').forEach(btn => {
                        if (btn.textContent.toLowerCase() === processedValue.toLowerCase()) {
                            btn.classList.add('selected-pill-active');
                        }
                    });
                }
                skillInputField.value = "";
            }
        });
    }
});

/**
 * Renders the Selected Skill Tags Container Visual Pills
 */
function renderSelectedTagPills() {
    const wrapper = document.getElementById('selected-tags-wrapper');
    wrapper.innerHTML = "";

    selectedSkillsTags.forEach(skill => {
        const pill = document.createElement('span');
        pill.className = "live-tag-pill";
        pill.innerHTML = `
            ${skill}
            <i class="fas fa-times" onclick="removeActiveTag('${skill.replace(/'/g, "\\'")}')"></i>
        `;
        wrapper.appendChild(pill);
    });
}

/**
 * Removes a Tag from the Active Set Object Selection
 */
function removeActiveTag(skillName) {
    selectedSkillsTags.delete(skillName);
    renderSelectedTagPills();

    // De-serialize and turn off active colors on top suggestion layout row
    document.querySelectorAll('.skill-chip-btn').forEach(btn => {
        if (btn.textContent === skillName) {
            btn.classList.remove('selected-pill-active');
        }
    });
}

/**
 * LIVE INTEGRATION API SUBMITTER
 * Packages all 3 steps and transmits data payload over to your Node backend system
 */
async function handleSignUp() {
    // 1. Gather Step 1 data
    const firstNames = document.getElementById("sf-names").value.trim();
    const email = document.getElementById("sf-email").value.trim();
    const password = document.getElementById("sf-pass").value;

    // 2. Gather Step 2 & 3 custom tracking attributes
    const industry = document.getElementById('sf-industry').value;
    const experienceLevel = document.getElementById('sf-experience').value;
    const skillsInterests = Array.from(selectedSkillsTags);
    let rolesTargeted = [];

    if (industry === 'Other') {
        const customIndustrySpecified = document.getElementById('sf-custom-industry').value.trim();
        const targetCustomRoleField = document.getElementById('sf-custom-role');
        const customRole = targetCustomRoleField ? targetCustomRoleField.value.trim() : "";
        
        rolesTargeted.push(customRole);
    } else {
        document.querySelectorAll('input[name="sf_roles"]:checked').forEach(checkbox => {
            rolesTargeted.push(checkbox.value);
        });
    }

    // 3. Post-Form Validation checks before enabling submit button
    if (rolesTargeted.length === 0 || (rolesTargeted.length === 1 && !rolesTargeted)) {
        alert("Please highlight or write down at least one target role position before submission.");
        return;
    }

    if (skillsInterests.length === 0) {
        alert("Please tag at least one skill asset to seed your Skills Gap Profile.");
        return;
    }

    // 4. Target DOM button styles state to "Signing Up..."
    const btn = document.querySelector(".final-submit-btn");
    const innerTextNode = btn.querySelector(".btn-inner-text");
    const originalContentHtml = innerTextNode.innerHTML;
    
    innerTextNode.textContent = "Signing up…";
    btn.disabled = true;

    // 5. Send complete profile package to backend server
    try {
        const resp = await fetch("http://localhost:5001/api/auth/signup", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
            email,
            password,
            firstNames,
            industry,
            experienceLevel,
            rolesTargeted,
            skillsInterests
            }),
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.error || "Sign‑up failed.");
        }

        const data = await resp.json();

        // Optional: store user_id or log in silently (from your original code)
        // localStorage.setItem("user_id", data.user.id);

        alert("Account created! Please log in.");
        window.location.href = "Login.html";
        
    } catch (err) {
        alert("Error: " + err.message);
        innerTextNode.innerHTML = originalContentHtml;
        btn.disabled = false;
    }
}

/**
 * Reusable Password Mask Toggle Utility Engine
 */
function togglePw() {
    const inp = document.getElementById("sf-pass");
    const btn = document.getElementById("sf-eye-icon-btn");
    const icon = btn?.querySelector("i");

    if (!icon) return;

    if (inp.type === "password") {
        inp.type = "text";
        icon.classList.add("fa-eye-slash");
        icon.classList.remove("fa-eye");
    } else {
        inp.type = "password";
        icon.classList.add("fa-eye");
        icon.classList.remove("fa-eye-slash");
    }
}