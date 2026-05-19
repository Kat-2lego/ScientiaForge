document.addEventListener('DOMContentLoaded', () => {

// for the domain chip selection


const chips = document.querySelectorAll(".chip");

chips.forEach(chip => {
    chip.addEventListener("click", () => {

        // Toggle selection
        chip.classList.toggle("selected");

        // Limit to 3 selections
        const selected = document.querySelectorAll(".chip.selected");

        if (selected.length > 3) {
            chip.classList.remove("selected");
            alert("You can select up to 3 domains only.");
        }
    });
});
    
    //  ------------ QUESTION BANK
  

const questionBank = {
    tech: [
        {
            question: "How do you approach solving technical problems?",
            options: [
                { text: "Break it into logical steps", traits: { tech: 3 } },
                { text: "Experiment until it works", traits: { tech: 2, design: 1 } },
                { text: "Look for existing solutions online", traits: { tech: 1, data: 1 } }
            ]
        },
        {
            question: "What excites you most?",
            options: [
                { text: "Building applications", traits: { tech: 3 } },
                { text: "Fixing bugs", traits: { tech: 2 } },
                { text: "Optimizing systems", traits: { tech: 3, data: 1 } }
            ]
        },
        {
            question: "Which sounds fun?",
            options: [
                { text: "Coding a new feature", traits: { tech: 3 } },
                { text: "Automating tasks", traits: { tech: 2 } },
                { text: "Designing system architecture", traits: { tech: 3 } }
            ]
        },
        {
            question: "How do you learn best?",
            options: [
                { text: "Hands-on coding", traits: { tech: 3 } },
                { text: "Watching tutorials", traits: { tech: 1 } },
                { text: "Reading docs", traits: { tech: 2 } }
            ]
        },
        {
            question: "What would you enjoy building?",
            options: [
                { text: "Web apps", traits: { tech: 3 } },
                { text: "APIs", traits: { tech: 2 } },
                { text: "Backend systems", traits: { tech: 3 } }
            ]
        },
        {
            question: "Your mindset?",
            options: [
                { text: "Structured & logical", traits: { tech: 3 } },
                { text: "Flexible", traits: { tech: 1 } },
                { text: "Analytical", traits: { tech: 2 } }
            ]
        },
        {
            question: "Preferred work?",
            options: [
                { text: "System building", traits: { tech: 3 } },
                { text: "Debugging", traits: { tech: 2 } },
                { text: "Testing", traits: { tech: 1 } }
            ]
        },
        {
            question: "Biggest strength?",
            options: [
                { text: "Problem solving", traits: { tech: 3 } },
                { text: "Focus", traits: { tech: 2 } },
                { text: "Logic", traits: { tech: 3 } }
            ]
        },
        {
            question: "Preferred tools?",
            options: [
                { text: "Code editors", traits: { tech: 3 } },
                { text: "Terminal", traits: { tech: 2 } },
                { text: "Frameworks", traits: { tech: 3 } }
            ]
        },
        {
            question: "Your style?",
            options: [
                { text: "Build from scratch", traits: { tech: 3 } },
                { text: "Use templates", traits: { tech: 1 } },
                { text: "Customize systems", traits: { tech: 2 } }
            ]
        }
    ],

    data: [
        {
            question: "What do you enjoy?",
            options: [
                { text: "Analyzing numbers", traits: { data: 3 } },
                { text: "Finding trends", traits: { data: 3 } },
                { text: "Organizing data", traits: { data: 2 } }
            ]
        },
        {
            question: "Best task?",
            options: [
                { text: "Working with Excel", traits: { data: 3 } },
                { text: "Dashboards", traits: { data: 3 } },
                { text: "SQL queries", traits: { data: 3 } }
            ]
        },
        {
            question: "How do you decide?",
            options: [
                { text: "Using data", traits: { data: 3 } },
                { text: "Logic", traits: { data: 2 } },
                { text: "Experience", traits: { business: 1 } }
            ]
        },
        {
            question: "Preferred work?",
            options: [
                { text: "Reports", traits: { data: 3 } },
                { text: "Charts", traits: { data: 2 } },
                { text: "Data cleaning", traits: { data: 3 } }
            ]
        },
        {
            question: "Interest?",
            options: [
                { text: "Statistics", traits: { data: 3 } },
                { text: "Patterns", traits: { data: 3 } },
                { text: "Insights", traits: { data: 3 } }
            ]
        },
        {
            question: "Tools?",
            options: [
                { text: "Excel", traits: { data: 3 } },
                { text: "Power BI", traits: { data: 3 } },
                { text: "Python", traits: { data: 2 } }
            ]
        },
        {
            question: "Focus?",
            options: [
                { text: "Accuracy", traits: { data: 3 } },
                { text: "Speed", traits: { data: 1 } },
                { text: "Clarity", traits: { data: 2 } }
            ]
        },
        {
            question: "Strength?",
            options: [
                { text: "Detail", traits: { data: 3 } },
                { text: "Logic", traits: { data: 2 } },
                { text: "Observation", traits: { data: 3 } }
            ]
        },
        {
            question: "Mindset?",
            options: [
                { text: "Analytical", traits: { data: 3 } },
                { text: "Curious", traits: { data: 2 } },
                { text: "Logical", traits: { data: 2 } }
            ]
        },
        {
            question: "Work style?",
            options: [
                { text: "Structured", traits: { data: 3 } },
                { text: "Flexible", traits: { data: 1 } },
                { text: "Precise", traits: { data: 3 } }
            ]
        }
    ],

    design: [
        {
            question: "What excites you?",
            options: [
                { text: "Creating visuals", traits: { design: 3 } },
                { text: "User experience", traits: { design: 3 } },
                { text: "Branding", traits: { design: 2 } }
            ]
        },
        {
            question: "Preferred work?",
            options: [
                { text: "UI design", traits: { design: 3 } },
                { text: "UX research", traits: { design: 3 } },
                { text: "Wireframing", traits: { design: 2 } }
            ]
        },
        {
            question: "Tools?",
            options: [
                { text: "Figma", traits: { design: 3 } },
                { text: "Adobe XD", traits: { design: 3 } },
                { text: "Sketching", traits: { design: 2 } }
            ]
        },
        {
            question: "Strength?",
            options: [
                { text: "Creativity", traits: { design: 3 } },
                { text: "Visual thinking", traits: { design: 3 } },
                { text: "Empathy", traits: { design: 2 } }
            ]
        },
        {
            question: "Focus?",
            options: [
                { text: "User needs", traits: { design: 3 } },
                { text: "Aesthetics", traits: { design: 3 } },
                { text: "Flow", traits: { design: 2 } }
            ]
        },
        {
            question: "Mindset?",
            options: [
                { text: "Creative", traits: { design: 3 } },
                { text: "Innovative", traits: { design: 3 } },
                { text: "Flexible", traits: { design: 2 } }
            ]
        },
        {
            question: "Enjoy?",
            options: [
                { text: "Design systems", traits: { design: 2 } },
                { text: "User journeys", traits: { design: 3 } },
                { text: "Layouts", traits: { design: 3 } }
            ]
        },
        {
            question: "Style?",
            options: [
                { text: "Minimalist", traits: { design: 3 } },
                { text: "Bold", traits: { design: 2 } },
                { text: "Modern", traits: { design: 3 } }
            ]
        },
        {
            question: "What matters?",
            options: [
                { text: "Experience", traits: { design: 3 } },
                { text: "Looks", traits: { design: 2 } },
                { text: "Usability", traits: { design: 3 } }
            ]
        },
        {
            question: "Work style?",
            options: [
                { text: "Creative flow", traits: { design: 3 } },
                { text: "Iterative", traits: { design: 2 } },
                { text: "Experimental", traits: { design: 3 } }
            ]
        }
    ]
};
    // CAREER DAtABAse

const careers = [
    {
        type: "tech",
        title: "Software Developer",
        salary: "R30,000 – R75,000",
        desc: "Build applications and scalable systems.",
        skills: ["JavaScript", "React", "Node.js"],
        demand: "High Demand",
        matchScore: 0,
        img: "url('https://images.unsplash.com/photo-1498050108023-c5249f4df085')"
    },
    {
        type: "data",
        title: "Data Analyst",
        salary: "R25,000 – R60,000",
        desc: "Analyze data to drive business decisions.",
        skills: ["SQL", "Excel", "Power BI"],
        demand: "Very High Demand",
        matchScore: 0,
        img: "url('https://images.unsplash.com/photo-1551288049-bebda4e38f71')"
    },
    {
        type: "design",
        title: "UX Designer",
        salary: "R25,000 – R65,000",
        desc: "Design user-friendly digital experiences.",
        skills: ["Figma", "User Research", "Prototyping"],
        demand: "High Demand",
        matchScore: 0,
        img: "url('https://images.unsplash.com/photo-1561070791-2526d30994b5')"
    }
];

    //                     STAte

    let dynamicQuestions = [];
    let currentQuestion = 0;
    let scores = { tech: 0, data: 0, design: 0 };

    // Elements

    const wrapper = document.getElementById("questionnaireWrapper");
    const generateBtn = document.getElementById("generateBtn");

    const cards = document.querySelectorAll(".career-card");
    const panelTitle = document.querySelector(".panel-header-row h2");
    const panelDesc = document.querySelector(".description");
    const panelSalary = document.querySelector(".salary-large");
    const panelHero = document.querySelector(".panel-hero");





// building a dynamic quiz

function generateQuestions(selectedDomains) {
    let finalQuestions = [];

    selectedDomains.forEach(domain => {
        if (questionBank[domain]) {
            finalQuestions = finalQuestions.concat(questionBank[domain]);
        }
    });

    return finalQuestions;
}



    // Starting the Quiz

    generateBtn.addEventListener("click", () => {

    const selectedDomains = Array.from(document.querySelectorAll(".chip.selected"))
        .map(chip => chip.dataset.domain);

    if (selectedDomains.length === 0) {
        alert("Select at least 1 domain");
        return;
    }

    dynamicQuestions = generateQuestions(selectedDomains);

    if (dynamicQuestions.length === 0) {
        alert("No questions found for selected domains.");
        return;
    }

    currentQuestion = 0;
    scores = { tech: 0, data: 0, design: 0, business: 0 };

    renderQuestion();


    //Dynamic question generation
    dynamicQuestions = generateQuestions(selectedDomains);

    currentQuestion = 0;
    scores = { tech: 0, data: 0, design: 0, business: 0 };

    renderQuestion();
    console.log(selectedDomains);
});

    // For the rendering of questions

    function renderQuestion() {

    const q = dynamicQuestions[currentQuestion]; 

    if (!q) {
        console.error("No question found. Check dynamicQuestions.");
        return;
    }

    wrapper.innerHTML = `
        <div class="quiz-container-modern">
            
            <div class="quiz-progress-bar">
                <div class="progress-fill" style="width: ${(currentQuestion / dynamicQuestions.length) * 100}%"></div>
            </div>

            <div class="quiz-question">
                ${q.question}
            </div>

            <div class="quiz-options">
                ${q.options.map(opt => `
                    <button class="quiz-option-btn" data='${JSON.stringify(opt.traits)}'>
                        <span>${opt.text}</span>
                        <i class="fa-solid fa-arrow-right"></i>
                    </button>
                `).join("")}
            </div>
        </div>
    `;

    document.querySelectorAll(".quiz-option-btn").forEach(btn => {
        btn.addEventListener("click", () => {

            document.querySelectorAll(".quiz-option-btn")
                .forEach(b => b.classList.remove("selected"));

            btn.classList.add("selected");

            const traits = JSON.parse(btn.getAttribute("data"));

            for (let t in traits) {
                scores[t] += traits[t];
            }

            setTimeout(() => {
                currentQuestion++;

                if (currentQuestion < dynamicQuestions.length) { // ✅ FIXED
                    renderQuestion();
                } else {
                    showLoading();
                }
            }, 300);
        });
    });
}

    //LOADING results for thr user

    function showLoading() {
        wrapper.innerHTML = `
            <div class="ai-processing">
                <div class="spinner"></div>
                <h3>Analyzing You...</h3>
                <p>Matching with careers...</p>
            </div>
        `;

        setTimeout(showResults, 2000);
    }

    //  RESULTS

function showResults() {

    let topTrait = Object.keys(scores)
        .reduce((a, b) => scores[a] > scores[b] ? a : b);

    //Assign match scores dynamically
    const total = Object.values(scores).reduce((a, b) => a + b, 0);

    careers.forEach(c => {
        const traitScore = scores[c.type] || 0;
        c.matchScore = Math.round((traitScore / total) * 100);
    });

    // The sortong of careers happens here
    const sortedCareers = [...careers].sort((a, b) => b.matchScore - a.matchScore);

    // The resulrs UI
    wrapper.innerHTML = `
        <div class="result-card-pro">
            <div class="result-glow"></div>

            <div class="result-header">
                <span class="ai-badge">AI RESULT</span>
            </div>

            <h2 class="result-main">
                🔥 You are <span>${topTrait.toUpperCase()}</span>
            </h2>

            <p class="result-desc">
                Based on your responses, our AI engine ranked your best-fit careers below.
            </p>
        </div>
    `;

    // Render dynamic cards
    renderDynamicCards(sortedCareers);

    // Auto update right panel with best match
    updateMainUI(sortedCareers[0]);
}
    //  Update the UI

    function updateMainUI(career) {
// This is for updating the cardss
        cards.forEach(card => {
            const title = card.querySelector("h4").textContent;

            if (title === career.title) {
                card.classList.add("active");
            } else {
                card.classList.remove("active");
            }
        });

// Updating theright panel 
        panelTitle.textContent = career.title;
        panelDesc.textContent = career.desc;
        panelSalary.innerHTML = career.salary + "<span>/Mo</span>";
        panelHero.style.backgroundImage = career.img;
    }

function renderDynamicCards(sortedCareers) {

    const grid = document.querySelector(".cards-grid");

    grid.innerHTML = "";

    sortedCareers.forEach((career, index) => {

        const card = document.createElement("div");
        card.className = "career-card";

        if (index === 0) card.classList.add("active");

        card.innerHTML = `
            <div class="card-top">
                <h4>${career.title}</h4>
                <span class="match-badge">${career.matchScore}% Match</span>
            </div>

            <div class="salary">${career.salary}<span>/Mo</span></div>

            <div class="skills-tags">
                ${career.skills.map(s => `<span>${s}</span>`).join("")}
            </div>

            <div class="card-image" style="background-image:${career.img}"></div>

            <div class="card-footer">
                <span class="demand">${career.demand}</span>
            </div>
        `;

        // click interaction
        card.addEventListener("click", () => {
            document.querySelectorAll(".career-card").forEach(c => c.classList.remove("active"));
            card.classList.add("active");

            updateMainUI(career);
        });

        grid.appendChild(card);
    });
}

    // The card clivking interaction
    cards.forEach(card => {
        card.addEventListener("click", () => {
            cards.forEach(c => c.classList.remove("active"));
            card.classList.add("active");

            const title = card.querySelector("h4").textContent;

            const career = careers.find(c => c.title === title);

            if (career) updateMainUI(career);
        });
    });

    

});


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

    document.querySelector(".profile div.profile-name").textContent = `${firstName}`;
    document.querySelector(".profile div.profile-email").textContent = email;
  } catch (err) {
    console.error("Failed to load user:", err);
  }
}

loadUserGreeting();