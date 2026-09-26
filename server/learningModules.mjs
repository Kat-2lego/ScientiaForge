// server/learningModules.mjs

export const LEARNING_MODULES = [
  {
    id: "git-basics",
    title: "Git & GitHub Basics",
    description: "Learn version control and collaboration workflows.",
    skills: ["Git", "Version control", "Collaborative development", "Source code management"],
    steps: [
      {
        title: "Install Git and create a GitHub account",
        description: "Set up your environment and accounts.",
      },
      {
        title: "Basic commands: clone, commit, push, pull",
        description: "Core Git workflow for everyday development.",
      },
      {
        title: "Branching and merging",
        description: "Work on features without breaking main.",
      },
    ],
    resourceUrl: "https://github.com/git-guides",
  },
  {
    id: "excel-fundamentals",
    title: "Excel for Business",
    description: "Essential spreadsheet skills for data and finance roles.",
    skills: ["Excel", "Spreadsheets", "Data entry", "Basic formulas"],
    steps: [
      { title: "Navigating Excel and basic formatting", description: "…" },
      { title: "Formulas and functions (SUM, AVERAGE, VLOOKUP)", description: "…" },
      { title: "Charts and basic data visualization", description: "…" },
    ],
    resourceUrl: "https://support.microsoft.com/excel",
  },
  {
    id: "communication-skills",
    title: "Effective Communication",
    description: "Interpersonal and written communication for any role.",
    skills: ["Communication", "Interpersonal skills", "Written communication", "Verbal communication"],
    steps: [
      { title: "Active listening and questioning", description: "…" },
      { title: "Writing clear emails and reports", description: "…" },
      { title: "Presenting ideas confidently", description: "…" },
    ],
    resourceUrl: "https://www.coursera.org/learn/communication-skills",
  },
  {
    id: "data-analysis-basics",
    title: "Data Analysis Fundamentals",
    description: "Core concepts for working with data.",
    skills: ["Data analysis", "Data cleansing", "Data interpretation", "Basic statistics"],
    steps: [
      { title: "Understanding data types and sources", description: "…" },
      { title: "Cleaning and preparing data", description: "…" },
      { title: "Basic descriptive statistics and visualisation", description: "…" },
    ],
    resourceUrl: "https://www.datacamp.com/courses/introduction-to-data-analysis",
  },
  {
    id: "web-fundamentals",
    title: "Web Development Fundamentals",
    description: "HTML, CSS and basic JavaScript for web roles.",
    skills: ["HTML", "CSS", "JavaScript", "Web development"],
    steps: [
      { title: "HTML structure and semantic tags", description: "…" },
      { title: "CSS styling and layouts", description: "…" },
      { title: "Basic JavaScript and DOM manipulation", description: "…" },
    ],
    resourceUrl: "https://developer.mozilla.org",
  },
  {
    id: "cooking-techniques",
    title: "Core Cooking Techniques",
    description: "Foundational culinary skills for kitchen roles.",
    skills: ["Cooking techniques", "Food preparation", "Knife skills", "Cook meat", "Cook vegetable products"],
    steps: [
      { title: "Knife skills and safe handling", description: "…" },
      { title: "Basic cooking methods: boiling, frying, baking", description: "…" },
      { title: "Preparing and plating dishes", description: "…" },
    ],
    resourceUrl: "https://www.onlineculinaryschool.net",
  },
  {
    id: "food-safety",
    title: "Food Safety & Hygiene",
    description: "Essential safety practices for culinary and hospitality roles.",
    skills: ["Food safety", "Hygiene", "HACCP", "Clean kitchen equipment"],
    steps: [
      { title: "Personal hygiene and handwashing", description: "…" },
      { title: "Safe food storage and temperature control", description: "…" },
      { title: "Cleaning and sanitising kitchen equipment", description: "…" },
    ],
    resourceUrl: "https://www.who.int/health-topics/food-safety",
  },
  {
    id: "accounting-basics",
    title: "Accounting Fundamentals",
    description: "Core concepts for entry-level accounting roles.",
    skills: ["Accounting techniques", "Bookkeeping", "Accounting entries", "Prepare trial accounting balances"],
    steps: [
      { title: "Double-entry bookkeeping basics", description: "…" },
      { title: "Recording transactions and journals", description: "…" },
      { title: "Preparing trial balances and basic reports", description: "…" },
    ],
    resourceUrl: "https://www.accountingcoach.com",
  },
  // Add more modules as needed
];