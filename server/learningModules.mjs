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
    stage: "Foundations",
    order: 290,
    description: "Core concepts for entry-level accounting roles.",
    skills: ["Accounting techniques", "Bookkeeping", "Accounting entries", "Prepare trial accounting balances"],
    steps: [
      { title: "Double-entry bookkeeping basics", description: "…" },
      { title: "Recording transactions and journals", description: "…" },
      { title: "Preparing trial balances and basic reports", description: "…" },
    ],
    resourceUrl: "https://www.accountingcoach.com",
  },
  {
  id: "property-market-foundations",
  title: "Understand the Property Market",
  stage: "Foundations",
  order: 10,
  description:
    "Learn how to research a property market and compare properties.",
  skills: [
    "real estate market",
    "perform property market research",
    "compare property values",
  ],
  steps: [
    {
      title: "Build a market research checklist",
      description:
        "Identify the location, property type, information sources and dates needed for a useful comparison.",
    },
    {
      title: "Compare similar properties",
      description:
        "Create a comparison table and explain differences in location, condition, size and asking price.",
    },
  ],
  practiceTask:
    "Prepare a short comparison of three sample properties. Clearly distinguish asking prices from confirmed transaction prices.",
  resources: [
  {
    title:
      "Read: RICS — Comparable evidence in real estate valuation (2019 PDF)",
    url:
      "https://www.rics.org/content/dam/ricsglobal/documents/standards/comparable_evidence_in_real_estate_valuation.pdf",
  },
],
},
{
  id: "property-client-service",
  title: "Find and Support Property Clients",
  stage: "Client skills",
  order: 20,
  description:
    "Practise understanding customer needs and maintaining useful client relationships.",
  skills: [
    "prospect new customers",
    "identify customer's needs",
    "customer service",
    "maintain relationships with customers",
  ],
  steps: [
    {
      title: "Prepare a client discovery conversation",
      description:
        "Write questions about the client's needs, budget, location preferences and timeline.",
    },
    {
      title: "Plan customer follow-up",
      description:
        "Design a simple process for recording enquiries, responding to questions and following up respectfully.",
    },
  ],
  practiceTask:
    "Role-play a first conversation with a fictional client and write a follow-up summary.",
  resources: [],
},
{
  id: "property-owner-communication",
  title: "Communicate Property Information",
  stage: "Client skills",
  order: 30,
  description:
    "Practise communicating with owners and presenting property information accurately.",
  skills: [
    "provide information on properties",
    "liaise with property owners",
  ],
  steps: [
    {
      title: "Create a property information checklist",
      description:
        "Separate verified information, owner-provided claims and details that still need checking.",
    },
    {
      title: "Practise owner communication",
      description:
        "Prepare questions to clarify property details, availability and viewing arrangements.",
    },
  ],
  practiceTask:
    "Create a fictional property information sheet and an owner enquiry email. Mark any unverified details.",
  resources: [],
},
{
  id: "property-valuation-introduction",
  title: "Introduction to Property Valuation",
  stage: "Career knowledge",
  order: 40,
  description:
    "Explore how property comparisons support a reasoned value estimate.",
  skills: [
    "advise on property value",
    "value properties",
  ],
  steps: [
    {
      title: "Review value-related evidence",
      description:
        "Use sample comparable properties to identify factors that could affect an estimate.",
    },
    {
      title: "Explain assumptions and uncertainty",
      description:
        "Write a sample estimate that states its evidence, limitations and assumptions.",
    },
  ],
  practiceTask:
    "Prepare an educational valuation exercise using fictional data, not advice for a real transaction.",
  note:
    "Introductory study only. This module does not establish professional valuation competence.",
  resources: [],
},
{
  id: "property-administration",
  title: "Property Office Administration",
  stage: "Workplace practice",
  order: 50,
  description:
    "Organise enquiries, appointments and property records.",
  skills: [
    "office administration",
  ],
  steps: [
    {
      title: "Organise a fictional client file",
      description:
        "Create a consistent folder structure and record checklist using sample information.",
    },
    {
      title: "Manage appointments and actions",
      description:
        "Build a viewing schedule and follow-up tracker.",
    },
  ],
  practiceTask:
    "Prepare a sample client file, viewing schedule and outstanding-actions list without using real personal data.",
  resources: [],
},
{
  id: "welding-safety-preparation",
  title: "Welding Safety and Work Preparation",
  stage: "Work preparation",
  order: 100,
  description:
    "Develop the safety knowledge and preparation skills needed before welding work begins.",
  skills: [
    "wear appropriate protective gear",
    "flammable fluids",
    "handle fuels",
    "fuel gas",
    "ensure equipment availability",
  ],
  suggestedAction:
    "Review a welding safety checklist with a qualified instructor and identify the preparation requirements for a supervised task.",
  note:
    "Practical work involving welding equipment, fuels or gases requires appropriate training and supervision.",
},
{
  id: "welding-plans-component-preparation",
  title: "Technical Plans and Component Preparation",
  stage: "Preparation skills",
  order: 110,
  description:
    "Develop your ability to interpret technical plans and prepare components for joining.",
  skills: [
    "interpret 2D plans",
    "interpret 3D plans",
    "align components",
    "apply precision metalworking techniques",
    "smooth burred surfaces",
  ],
  suggestedAction:
    "Use a sample technical drawing to identify dimensions, component alignment and preparation requirements.",
},
{
  id: "welding-materials-heat",
  title: "Metals, Filler Materials and Heat",
  stage: "Technical knowledge",
  order: 120,
  description:
    "Build knowledge of metals, filler selection and temperature considerations in welding.",
  skills: [
    "types of metal",
    "metal thermal conductivity",
    "select filler metal",
    "ensure correct metal temperature",
    "torch temperature for metal processes",
  ],
  suggestedAction:
    "Discuss a sample welding specification with an instructor and explain its material, filler and temperature considerations.",
},
{
  id: "welding-processes-equipment",
  title: "Welding Processes and Equipment",
  stage: "Practical skills",
  order: 130,
  description:
    "Identify the welding processes and equipment-operation skills you still need to acquire.",
  skills: [
    "welding techniques",
    "apply arc welding techniques",
    "operate welding equipment",
    "perform tungsten inert gas welding",
    "perform metal active gas welding",
    "perform metal inert gas welding",
    "operate oxy-fuel welding torch",
    "join metals",
  ],
  suggestedAction:
    "With an instructor, identify which listed processes need separate training and supervised assessment.",
  note:
    "Grouping these skills does not mean competence in one welding process establishes competence in the others.",
},
{
  id: "welding-quality-inspection",
  title: "Quality Checks and Troubleshooting",
  stage: "Quality and inspection",
  order: 140,
  description:
    "Develop your ability to recognise defects, monitor work and respond to quality problems.",
  skills: [
    "recognise signs of corrosion",
    "spot metal imperfections",
    "perform test run",
    "monitor gauge",
    "remove processed workpiece",
    "quality standards",
    "remove inadequate workpieces",
    "troubleshoot",
  ],
  suggestedAction:
    "Review sample inspection records or defect images and explain which findings would require further checking or corrective action.",
},
{
  id: "software-requirements-specifications",
  title: "Requirements and Software Specifications",
  stage: "Analysis and planning",
  order: 200,
  description:
    "Develop your ability to understand customer needs and translate them into clear software requirements.",
  skills: [
    "identify customer requirements",
    "analyse software specifications",
    "interpret technical requirements",
    "define technical requirements",
  ],
  suggestedAction:
    "Take a fictional customer request and write its functional requirements, constraints and acceptance criteria.",
},
{
  id: "software-design-modelling",
  title: "Software Design and Technical Modelling",
  stage: "Design skills",
  order: 210,
  description:
    "Develop the design, diagramming and modelling skills identified in this career's essential requirements.",
  skills: [
    "use technical drawing software",
    "utilise computer-aided software engineering tools",
    "create flowchart diagram",
    "technical drawings",
    "use software design patterns",
    "develop software prototype",
  ],
  suggestedAction:
    "Create a flowchart and a small prototype for a sample application, then explain the design decisions.",
  note:
    "These skills are grouped from the supplied occupation profile. Their relevance can vary between software-development specialisms.",
},
{
  id: "software-programming-development-tools",
  title: "Programming and Development Tools",
  stage: "Implementation skills",
  order: 220,
  description:
    "Build the programming and tooling capabilities needed to implement and manage software changes.",
  skills: [
    "computer programming",
    "integrated development environment software",
    "use software libraries",
    "tools for software configuration management",
    "develop automated migration methods",
  ],
  suggestedAction:
    "Build a small application using a development environment, a reusable library and version-controlled configuration. Plan a sample migration where relevant.",
},
{
  id: "software-debugging-documentation",
  title: "Debugging and Technical Documentation",
  stage: "Quality and communication",
  order: 230,
  description:
    "Develop your ability to investigate software problems and communicate technical information.",
  skills: [
    "ICT debugging tools",
    "debug software",
    "provide technical documentation",
  ],
  suggestedAction:
    "Investigate a reproducible bug in a sample project and document the cause, fix and verification steps.",
},
{
  id: "software-engineering-projects",
  title: "Engineering Principles and Project Delivery",
  stage: "Engineering practice",
  order: 240,
  description:
    "Develop the engineering, investigation and project-planning skills included in the selected profile.",
  skills: [
    "project management",
    "manage engineering project",
    "engineering processes",
    "perform scientific research",
    "engineering principles",
  ],
  suggestedAction:
    "Outline a small engineering project with a problem statement, investigation approach, milestones, risks and a method for evaluating the result.",
},
{
  id: "accounting-records-controls",
  title: "Accounting Records and Transaction Controls",
  stage: "Records and accuracy",
  order: 300,
  description:
    "Develop your ability to explain, maintain and check accounting records and supporting information.",
  skills: [
    "explain accounting records",
    "identify accounting errors",
    "check accounting records",
    "manage accounts",
    "attach accounting certificates to accounting transactions",
  ],
  suggestedAction:
    "Review a fictional set of transactions, check supporting documents and explain any inconsistencies or corrections needed.",
},
{
  id: "accounting-financial-statements",
  title: "Financial Statements and Balance Sheet Operations",
  stage: "Financial reporting",
  order: 310,
  description:
    "Build your understanding of financial statements and the accounting operations used to prepare them.",
  skills: [
    "prepare financial statements",
    "perform balance sheet operations",
    "interpret financial statements",
    "financial statements",
    "depreciation",
  ],
  suggestedAction:
    "Use a fictional trial balance to prepare sample statements, explain a depreciation adjustment and interpret the resulting figures.",
},
{
  id: "accounting-tax-compliance",
  title: "Tax and Statutory Compliance",
  stage: "Compliance knowledge",
  order: 320,
  description:
    "Identify the tax, legal and reporting knowledge you need for accounting work.",
  skills: [
    "tax legislation",
    "commercial law",
    "prepare tax returns forms",
    "follow the statutory obligations",
    "bookkeeping regulations",
    "ensure compliance with accounting conventions",
    "calculate tax",
  ],
  suggestedAction:
    "For a fictional business in a specified jurisdiction and tax period, identify the applicable reporting requirements and complete an educational tax calculation.",
  note:
    "Tax rules, legal obligations and accounting requirements depend on the jurisdiction, reporting framework and period. Use current, applicable guidance.",
},
{
  id: "accounting-analysis-fraud-awareness",
  title: "Financial Analysis and Fraud Awareness",
  stage: "Analysis and review",
  order: 330,
  description:
    "Develop your ability to analyse financial results and recognise issues that require further investigation.",
  skills: [
    "analyse financial performance of a company",
    // "statistics",
    "fraud detection",
  ],
  suggestedAction:
    "Analyse fictional financial results, identify unusual patterns and explain what additional evidence would be needed before drawing conclusions.",
  note:
    "An unusual transaction or pattern is a reason to investigate, not proof of fraud.",
},
{
  id: "accounting-department-procedures",
  title: "Accounting Processes and Procedures",
  stage: "Workplace processes",
  order: 340,
  description:
    "Develop your understanding of accounting department workflows and documented procedures.",
  skills: [
    "financial department processes",
    "draft accounting procedures",
    "accounting department processes",
  ],
  suggestedAction:
    "Map a sample invoice-to-payment workflow and draft a procedure showing responsibilities, approval points and record-keeping requirements.",
},
{
  id: "chef-safety-hygiene",
  title: "Kitchen Safety, Hygiene and Waste",
  stage: "Safe working practices",
  order: 400,
  description:
    "Develop the safe-working, hygiene and waste-handling skills needed in a food preparation environment.",
  skills: [
    "ensure cleanliness of food preparation area",
    "maintain a safe, hygienic and secure working environment",
    "comply with food safety and hygiene",
    "dispose waste",
  ],
  suggestedAction:
    "Review a sample kitchen hygiene checklist and identify cleaning, waste-handling and workplace-safety responsibilities.",
  note:
    "Practical food preparation should follow applicable food-safety procedures and appropriate supervision.",
},
{
  id: "chef-supplies-storage-costs",
  title: "Kitchen Supplies, Storage and Costs",
  stage: "Kitchen organisation",
  order: 410,
  description:
    "Develop your ability to organise kitchen supplies, store ingredients and monitor expenses.",
  skills: [
    "store raw food materials",
    "control of expenses",
    "receive kitchen supplies",
    "order supplies",
  ],
  suggestedAction:
    "Use a fictional menu and stock list to prepare a supply order, receiving checklist, storage plan and ingredient-cost estimate.",
},
{
  id: "chef-preparation-cooking",
  title: "Food Preparation and Cooking",
  stage: "Practical culinary skills",
  order: 420,
  description:
    "Identify the preparation, cutting, cooking, reheating and finishing techniques you still need to develop.",
  skills: [
    "use culinary finishing techniques",
    "use food preparation techniques",
    "maintain kitchen equipment at correct temperature",
    "use reheating techniques",
    "use food cutting tools",
    "use cooking techniques",
  ],
  suggestedAction:
    "With a suitable instructor or supervisor, plan a simple dish and identify the preparation methods, equipment checks and cooking techniques it requires.",
  note:
    "Different techniques require their own practice and assessment. A grouped recommendation does not establish practical competence.",
},
{
  id: "chef-teamwork-handover",
  title: "Kitchen Teamwork and Handover",
  stage: "Team coordination",
  order: 430,
  description:
    "Develop your ability to coordinate with a hospitality team and hand over a food preparation area clearly.",
  skills: [
    "work in a hospitality team",
    "handover the food preparation area",
  ],
  suggestedAction:
    "Create a sample shift-handover checklist covering outstanding tasks, stock issues, equipment concerns and cleaning status.",
},

  // Add more modules as needed
];