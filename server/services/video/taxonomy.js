/**
 * The Video Discovery vocabulary: subjects, topics and subtopics (CAPS-aligned for school
 * subjects), plus words that signal a video type, level, curriculum or language.
 *
 * To add a subject or topic, add an entry here: search, ranking, detection and the
 * filter menus all read from this file. Synonyms are matched as whole words and
 * are plural-tolerant, so "identity" also matches "identities".
 */
"use strict";

const { normalize, stemmedText, hasPhrase } = require("./text");

const t = (id, name, synonyms = [], subtopics = []) => ({ id, name, synonyms, subtopics });
const s = (id, name, synonyms = []) => ({ id, name, synonyms });

const SUBJECTS = [
  {
    id: "mathematics", name: "Mathematics", school: true, grades: [8, 9, 10, 11, 12], stable: true,
    synonyms: ["maths", "math", "wiskunde"],
    topics: [
      t("algebra", "Algebra", ["algebraic", "quadratic equation", "simultaneous equation", "factorise", "factorising", "exponent", "surd"], [
        s("equations-inequalities", "Equations and inequalities", ["quadratic equation", "quadratic inequality", "simultaneous equation", "solve for x"]),
        s("exponents-surds", "Exponents and surds", ["exponent", "exponential equation", "surd", "law of exponent"]),
        s("factorisation", "Factorisation", ["factorise", "factorising", "factorization", "factoring"]),
      ]),
      t("sequences-series", "Sequences and series", ["number pattern", "sequence", "series", "sigma notation", "arithmetic sequence", "geometric sequence", "quadratic pattern"], [
        s("arithmetic", "Arithmetic sequences and series", ["arithmetic sequence", "arithmetic series", "arithmetic progression"]),
        s("geometric", "Geometric sequences and series", ["geometric sequence", "geometric series", "sum to infinity", "convergence"]),
        s("quadratic-patterns", "Quadratic patterns", ["quadratic pattern", "quadratic sequence", "second difference"]),
        s("sigma", "Sigma notation", ["sigma notation", "sigma"]),
      ]),
      t("functions", "Functions and graphs", ["function", "graph", "parabola", "hyperbola", "exponential graph", "inverse function", "sketching graph"], [
        s("parabola", "Parabola", ["parabola", "quadratic function", "quadratic graph"]),
        s("hyperbola", "Hyperbola", ["hyperbola", "asymptote"]),
        s("exponential", "Exponential and logarithmic graphs", ["exponential graph", "exponential function", "logarithm", "log graph"]),
        s("inverse", "Inverse functions", ["inverse function", "inverse"]),
      ]),
      t("finance", "Finance, growth and decay", ["financial maths", "financial mathematics", "compound interest", "simple interest", "annuity", "depreciation", "loan", "present value", "future value"], [
        s("interest", "Simple and compound interest", ["compound interest", "simple interest", "effective interest", "nominal interest"]),
        s("annuities", "Annuities", ["annuity", "future value", "present value", "sinking fund", "bond repayment"]),
        s("depreciation", "Growth and depreciation", ["depreciation", "reducing balance", "straight line depreciation"]),
      ]),
      t("calculus", "Differential calculus", ["calculus", "differentiation", "derivative", "differentiate", "first principle", "cubic function", "cubic graph", "optimisation", "rate of change"], [
        s("first-principles", "First principles", ["first principle", "limit"]),
        s("rules", "Rules of differentiation", ["rules of differentiation", "power rule", "product rule", "chain rule", "quotient rule", "differentiation rule", "derivative rule"]),
        s("cubic-graphs", "Cubic graphs", ["cubic graph", "cubic function", "turning point", "point of inflection", "concavity"]),
        s("optimisation", "Optimisation and rates of change", ["optimisation", "optimization", "maximum and minimum", "rate of change"]),
      ]),
      t("probability", "Probability", ["probability", "venn diagram", "tree diagram", "counting principle", "independent event", "mutually exclusive"], [
        s("venn-tree", "Venn and tree diagrams", ["venn diagram", "tree diagram", "contingency table"]),
        s("counting", "Counting principle", ["counting principle", "fundamental counting", "arrangement", "factorial"]),
        s("events", "Dependent and independent events", ["independent event", "dependent event", "mutually exclusive", "complementary event"]),
      ]),
      t("trigonometry", "Trigonometry", ["trigonometry", "trig", "trigonometric", "sin cos tan", "sine rule", "cosine rule", "sin x", "cos x", "tan x", "sin", "cos", "sine", "cosine"], [
        s("identities", "Trigonometric identities", ["trigonometric identity", "trig identity", "prove identity", "proving identity"]),
        s("equations", "Trigonometric equations", ["trigonometric equation", "trig equation", "general solution"]),
        s("reduction", "Reduction formulae", ["reduction formula", "co function", "cofunction", "special angle"]),
        s("compound-angles", "Compound and double angles", ["compound angle", "double angle"]),
        s("graphs", "Trigonometric graphs", ["trigonometric graph", "trig graph", "sine graph", "cosine graph", "tan graph"]),
        s("2d-3d", "Sine, cosine and area rules", ["sine rule", "cosine rule", "area rule", "3d trigonometry", "2d and 3d"]),
      ]),
      t("euclidean-geometry", "Euclidean geometry", ["euclidean geometry", "circle geometry", "geometry theorem", "cyclic quadrilateral", "tangent", "similar triangle", "proportionality"], [
        s("circle-geometry", "Circle geometry", ["circle geometry", "cyclic quadrilateral", "tangent chord", "angle at the centre"]),
        s("similarity", "Similarity and proportionality", ["similar triangle", "similarity", "proportionality", "midpoint theorem"]),
      ]),
      t("analytical-geometry", "Analytical geometry", ["analytical geometry", "coordinate geometry", "gradient", "midpoint", "distance formula", "equation of a circle", "equation of a line"], [
        s("lines", "Straight lines", ["equation of a line", "gradient", "inclination", "perpendicular line", "parallel line"]),
        s("circles", "Circles", ["equation of a circle", "tangent to a circle"]),
      ]),
      t("statistics", "Statistics", ["statistics", "mean median mode", "standard deviation", "variance", "box and whisker", "ogive", "regression", "correlation", "scatter plot"], [
        s("dispersion", "Measures of centre and spread", ["standard deviation", "variance", "box and whisker", "quartile", "ogive", "interquartile range"]),
        s("regression", "Regression and correlation", ["regression", "correlation", "line of best fit", "scatter plot", "least squares"]),
      ]),
      t("measurement", "Measurement", ["measurement", "surface area", "volume of", "3d shape", "prism", "cylinder", "cone", "sphere", "pyramid"]),
    ],
  },
  {
    id: "mathematical-literacy", name: "Mathematical Literacy", school: true, grades: [10, 11, 12], stable: true,
    synonyms: ["maths literacy", "math lit", "mathlit", "maths lit"],
    topics: [
      t("finance", "Finance", ["finance", "budget", "tariff", "income and expenditure", "tax", "interest", "inflation", "exchange rate"]),
      t("measurement", "Measurement", ["measurement", "perimeter", "area", "volume", "conversion"]),
      t("maps-plans", "Maps, plans and representations", ["map", "floor plan", "scale", "elevation plan", "layout plan"]),
      t("data-handling", "Data handling", ["data handling", "graph", "mean median mode", "statistics"]),
      t("probability", "Probability", ["probability", "risk", "expected outcome"]),
    ],
  },
  {
    id: "physical-sciences", name: "Physical Sciences", school: true, grades: [10, 11, 12], stable: true,
    synonyms: ["physical science", "physics", "chemistry", "fisiese wetenskappe"],
    topics: [
      t("mechanics", "Mechanics", ["newton law", "newton's law", "momentum", "impulse", "projectile", "work energy power", "force", "friction"], [
        s("newtons-laws", "Newton's laws", ["newton law", "newton's law", "newton", "net force", "friction", "inclined plane", "universal gravitation", "gravitational force"]),
        s("momentum", "Momentum and impulse", ["momentum", "impulse", "collision", "conservation of momentum"]),
        s("vertical-projectile", "Vertical projectile motion", ["projectile motion", "vertical projectile", "free fall"]),
        s("work-energy-power", "Work, energy and power", ["work energy", "work energy theorem", "power", "conservation of energy"]),
      ]),
      t("waves", "Waves, sound and light", ["doppler effect", "wave", "sound", "light", "photoelectric effect"], [
        s("doppler", "Doppler effect", ["doppler effect", "doppler"]),
        s("photoelectric", "Photoelectric effect", ["photoelectric effect", "work function", "emission spectrum"]),
      ]),
      t("electricity", "Electricity and magnetism", ["electric circuit", "electrostatic", "electrodynamic", "internal resistance", "coulomb law", "electric field", "generator", "motor"], [
        s("circuits", "Electric circuits", ["electric circuit", "internal resistance", "emf", "ohm law", "series and parallel"]),
        s("electrostatics", "Electrostatics", ["electrostatic", "coulomb law", "electric field"]),
        s("electrodynamics", "Electrodynamics", ["electrodynamic", "generator", "motor", "alternating current", "ac and dc"]),
      ]),
      t("organic-chemistry", "Organic chemistry", ["organic chemistry", "organic molecule", "functional group", "iupac naming", "alkane", "alkene", "alcohol", "ester", "polymer"]),
      t("rates-equilibrium", "Reaction rates and equilibrium", ["rate of reaction", "reaction rate", "chemical equilibrium", "le chatelier", "equilibrium constant", "kc"], [
        s("rates", "Rates of reaction", ["rate of reaction", "reaction rate", "activation energy", "collision theory"]),
        s("equilibrium", "Chemical equilibrium", ["chemical equilibrium", "le chatelier", "equilibrium constant", "kc"]),
      ]),
      t("acids-bases", "Acids and bases", ["acid and base", "acids and bases", "titration", "ph", "neutralisation", "hydrolysis"]),
      t("electrochemistry", "Electrochemistry", ["electrochemistry", "galvanic cell", "electrolytic cell", "redox", "electrolysis"]),
      t("stoichiometry", "Stoichiometry", ["stoichiometry", "mole", "limiting reagent", "percentage yield", "molar mass", "concentration"]),
      t("vectors-motion", "Vectors and motion", ["vector", "scalar", "resultant", "kinematics", "motion in one dimension", "equations of motion", "velocity", "acceleration", "displacement"]),
      t("matter", "Matter, atoms and bonding", ["atomic structure", "atom", "periodic table", "electron configuration", "chemical bonding", "covalent bond", "ionic bond", "lewis diagram", "molecular shape", "vsepr", "intermolecular force"]),
      t("gases", "Ideal gases and gas laws", ["ideal gas", "gas law", "boyle law", "boyle's law", "charles law", "charles's law", "pressure law", "kinetic theory"]),
      t("energy-change", "Energy and chemical change", ["exothermic", "endothermic", "heat of reaction", "energy change", "bond energy"]),
    ],
  },
  {
    id: "life-sciences", name: "Life Sciences", school: true, grades: [10, 11, 12], stable: true,
    synonyms: ["life science", "biology", "lewenswetenskappe"],
    topics: [
      t("dna", "DNA and protein synthesis", ["dna", "rna", "protein synthesis", "transcription", "translation", "dna replication", "dna profiling"]),
      t("meiosis", "Meiosis", ["meiosis", "cell division", "crossing over", "non disjunction"]),
      t("reproduction", "Reproduction", ["reproduction", "reproductive system", "menstrual cycle", "fertilisation", "gametogenesis", "pregnancy", "vertebrate reproduction"], [
        s("human", "Human reproduction", ["human reproduction", "menstrual cycle", "gametogenesis", "fertilisation", "implantation", "placenta"]),
        s("vertebrates", "Reproduction in vertebrates", ["vertebrate reproduction", "amniotic egg", "precocial", "altricial", "external fertilisation"]),
      ]),
      t("genetics", "Genetics and inheritance", ["genetics", "inheritance", "monohybrid", "dihybrid", "punnett square", "pedigree", "blood group", "sex linked", "mutation"]),
      t("evolution", "Evolution", ["evolution", "natural selection", "speciation", "human evolution", "darwin", "lamarck", "punctuated equilibrium"]),
      t("nervous-system", "Nervous system and senses", ["nervous system", "neuron", "reflex arc", "brain", "human eye", "human ear", "senses", "accommodation"], [
        s("nervous", "Nervous system", ["nervous system", "neuron", "reflex arc", "synapse", "brain"]),
        s("eye", "The human eye", ["human eye", "eye", "accommodation", "pupillary mechanism", "binocular vision"]),
        s("ear", "The human ear", ["human ear", "ear", "hearing", "balance", "organ of corti"]),
      ]),
      t("endocrine", "Endocrine system and homeostasis", ["endocrine system", "hormone", "homeostasis", "negative feedback", "thyroxin", "insulin", "glucagon", "thermoregulation", "osmoregulation"]),
      t("plant-responses", "Plant responses", ["plant hormone", "auxin", "gibberellin", "phototropism", "geotropism", "plant response", "abscisic acid"]),
      t("human-impact", "Human impact on the environment", ["human impact", "environment", "pollution", "climate change", "food security", "biodiversity"]),
      t("cells", "Cells, tissues and mitosis", ["cell structure", "cell organelle", "cell membrane", "animal cell", "plant cell", "mitosis", "cell cycle", "plant tissue", "animal tissue", "chemistry of life", "biomolecule", "enzyme"]),
      t("photosynthesis-respiration", "Photosynthesis and respiration", ["photosynthesis", "cellular respiration", "aerobic respiration", "anaerobic respiration", "respiration", "energy transformation"]),
      t("nutrition", "Human nutrition", ["human nutrition", "nutrition", "digestion", "digestive system", "alimentary canal", "absorption"]),
      t("gas-exchange-excretion", "Gas exchange and excretion", ["gaseous exchange", "gas exchange", "breathing", "lungs", "excretion", "kidney", "nephron"]),
      t("transport-support", "Transport and support systems", ["circulatory system", "heart", "blood vessel", "blood circulation", "transpiration", "xylem", "phloem", "skeleton", "lymphatic system"]),
      t("biodiversity-ecology", "Biodiversity, classification and ecology", ["classification", "five kingdoms", "microorganism", "bacteria", "virus", "fungi", "population ecology", "ecosystem", "food web", "food chain", "succession"]),
    ],
  },
  {
    id: "accounting", name: "Accounting", school: true, grades: [10, 11, 12], stable: true,
    synonyms: ["accounts", "rekeningkunde"],
    topics: [
      t("companies", "Companies and financial statements", ["company", "companies", "financial statement", "income statement", "balance sheet", "statement of financial position", "shares", "dividend"]),
      t("cash-flow", "Cash flow statement", ["cash flow", "cash flow statement", "cash budget"]),
      t("analysis", "Analysis and interpretation", ["financial analysis", "ratio analysis", "interpretation", "financial indicator", "return on equity", "earnings per share"]),
      t("inventory", "Inventory valuation", ["inventory valuation", "stock valuation", "fifo", "weighted average", "specific identification"]),
      t("cost-accounting", "Cost accounting", ["cost accounting", "manufacturing", "production cost", "break even", "fixed cost", "variable cost"]),
      t("reconciliations", "Reconciliations", ["reconciliation", "bank reconciliation", "debtor reconciliation", "creditor reconciliation"]),
      t("fixed-assets", "Fixed assets", ["fixed asset", "tangible asset", "depreciation"]),
      t("vat", "VAT", ["vat", "value added tax"]),
      t("ethics-audit", "Ethics and internal control", ["ethics", "internal control", "audit", "corporate governance"]),
    ],
  },
  {
    id: "business-studies", name: "Business Studies", school: true, grades: [10, 11, 12], stable: true,
    synonyms: ["business studies", "besigheidstudies"],
    topics: [
      t("business-environments", "Business environments", ["business environment", "micro environment", "market environment", "macro environment", "pestle"]),
      t("legislation", "Business legislation", ["legislation", "bbbee", "b bbee", "employment equity", "labour relations act", "consumer protection act", "skills development act", "basic conditions of employment"]),
      t("human-resources", "Human resources", ["human resources", "recruitment", "selection", "induction", "placement", "remuneration"]),
      t("management-leadership", "Management and leadership", ["management", "leadership", "leadership style"]),
      t("ethics", "Ethics and professionalism", ["ethics", "professionalism", "unethical", "corporate social responsibility", "csr", "csi"]),
      t("investment", "Investment", ["investment", "securities", "shares", "insurance", "unit trust", "retirement annuity"]),
      t("quality", "Quality of performance", ["quality", "total quality management", "tqm", "quality control"]),
      t("strategies", "Business strategies", ["business strategy", "strategies", "swot", "porter five forces", "integration strategy", "diversification"]),
    ],
  },
  {
    id: "economics", name: "Economics", school: true, grades: [10, 11, 12], stable: true,
    synonyms: ["econ", "ekonomie"],
    topics: [
      t("macroeconomics", "Macroeconomics", ["macroeconomics", "circular flow", "business cycle", "public sector", "foreign exchange", "balance of payments", "fiscal policy", "monetary policy"]),
      t("microeconomics", "Microeconomics", ["microeconomics", "supply and demand", "demand and supply", "market equilibrium", "elasticity", "opportunity cost", "production possibility", "market structure", "perfect competition", "monopoly", "oligopoly", "monopolistic competition", "market failure"]),
      t("economic-pursuits", "Economic pursuits", ["economic growth", "economic development", "industrial development", "protectionism", "free trade", "globalisation"]),
      t("contemporary-issues", "Contemporary economic issues", ["inflation", "tourism", "environmental sustainability", "unemployment"]),
    ],
  },
  {
    id: "geography", name: "Geography", school: true, grades: [10, 11, 12], stable: true,
    synonyms: ["geo", "geografie"],
    topics: [
      t("climate-weather", "Climate and weather", ["climate", "weather", "mid latitude cyclone", "tropical cyclone", "subsidence", "berg wind", "local climate", "urban heat island", "synoptic"]),
      t("geomorphology", "Geomorphology", ["geomorphology", "drainage system", "drainage basin", "fluvial", "river profile", "stream order", "catchment", "river capture"]),
      t("settlement", "Settlement geography", ["settlement", "rural settlement", "urban settlement", "urbanisation", "urban structure", "land use zone"]),
      t("economic-geography", "Economic geography of South Africa", ["economic geography", "primary sector", "secondary sector", "industrial region", "spatial development initiative", "informal sector"]),
      t("mapwork", "Mapwork and GIS", ["mapwork", "map work", "topographic map", "orthophoto", "map calculation", "gis", "gradient calculation"]),
    ],
  },
  {
    id: "history", name: "History", school: true, grades: [10, 11, 12], stable: true,
    synonyms: ["geskiedenis"],
    topics: [
      t("cold-war", "The Cold War", ["cold war", "berlin wall", "cuban missile crisis", "truman doctrine", "marshall plan", "vietnam war", "containment"]),
      t("independent-africa", "Independent Africa", ["independent africa", "congo", "tanzania", "angola", "cuito cuanavale", "african socialism"]),
      t("civil-society", "Civil society protests", ["civil rights movement", "civil rights", "black power", "march on washington", "civil society protest"]),
      t("civil-resistance-sa", "Civil resistance in South Africa", ["black consciousness", "steve biko", "soweto uprising", "civil resistance", "sharpeville"]),
      t("democracy-sa", "The coming of democracy in South Africa", ["truth and reconciliation commission", "trc", "codesa", "negotiated settlement", "1994 election"]),
      t("globalisation", "The end of the Cold War and globalisation", ["globalisation", "end of the cold war", "fall of the berlin wall", "collapse of the soviet union"]),
    ],
  },
  {
    id: "english", name: "English", school: true, grades: [8, 9, 10, 11, 12], stable: true,
    synonyms: ["english home language", "english first additional language", "english fal", "english hl"],
    topics: [
      t("comprehension", "Comprehension", ["comprehension", "reading comprehension"]),
      t("summary", "Summary writing", ["summary writing", "summary"]),
      t("language", "Language structures", ["language structures", "grammar", "parts of speech", "active and passive voice", "direct and indirect speech", "punctuation"]),
      t("poetry", "Poetry", ["poetry", "poem", "figure of speech", "literary device"]),
      t("literature", "Novels and drama", ["novel", "drama", "play", "literature", "character analysis", "theme"]),
      t("essay", "Essay writing", ["essay writing", "essay", "narrative essay", "argumentative essay", "discursive essay"]),
      t("transactional", "Transactional writing", ["transactional writing", "formal letter", "informal letter", "cv", "speech", "report writing", "email"]),
    ],
  },
  {
    id: "computer-applications-technology", name: "Computer Applications Technology", school: true, grades: [10, 11, 12], stable: false,
    synonyms: ["cat", "computer applications"],
    topics: [
      t("word-processing", "Word processing", ["word processing", "microsoft word", "ms word", "mail merge", "table of contents", "styles"]),
      t("spreadsheets", "Spreadsheets", ["spreadsheet", "excel", "ms excel", "vlookup", "countif", "sumif", "if function", "pivot table"]),
      t("databases", "Databases", ["database", "microsoft access", "ms access", "query", "form", "report"]),
      t("html", "HTML and web design", ["html", "web design", "web page", "css"]),
      t("systems-networks", "Systems technologies and networks", ["systems technologies", "hardware", "software", "network", "internet", "cloud computing"]),
      t("social-implications", "Social implications", ["social implications", "e safety", "cybersecurity", "social engineering", "green computing"]),
    ],
  },
  {
    id: "information-technology", name: "Information Technology", school: true, grades: [10, 11, 12], stable: false,
    synonyms: ["it", "delphi"],
    topics: [
      t("programming", "Delphi programming", ["delphi", "pascal", "programming", "loops", "arrays", "string handling"]),
      t("oop", "Object-oriented programming", ["object oriented", "oop", "class", "object", "constructor"]),
      t("databases-sql", "Databases and SQL", ["sql", "database", "select statement", "query"]),
      t("algorithms", "Algorithms and problem solving", ["algorithm", "sorting", "searching", "bubble sort", "binary search", "flowchart", "pseudocode"]),
      t("systems", "Systems and communication technologies", ["systems technologies", "networks", "communication technologies", "hardware"]),
    ],
  },
  {
    id: "programming", name: "Programming", school: false, stable: false,
    synonyms: ["coding", "software development"],
    topics: [
      t("python", "Python", ["python"], [
        s("basics", "Python basics", ["python basics", "python for beginners", "variables", "loops", "functions"]),
        s("oop", "Object-oriented Python", ["python oop", "python class", "object oriented python"]),
        s("apis", "APIs and web requests", ["api", "rest api", "requests library", "fastapi", "flask"]),
        s("data", "Data analysis with Python", ["pandas", "numpy", "data analysis", "matplotlib"]),
      ]),
      t("javascript", "JavaScript", ["javascript", "js", "node js", "nodejs", "dom", "react"]),
      t("java", "Java", ["java"]),
      t("csharp", "C#", ["c sharp", "csharp", "dotnet", "net"]),
      t("web", "Web development", ["web development", "html", "css", "frontend", "backend"]),
      t("git", "Git and GitHub", ["git", "github", "version control"]),
    ],
  },
  {
    id: "data-analytics", name: "Data Analytics", school: false, stable: false,
    synonyms: ["data analysis", "data science"],
    topics: [
      t("sql", "SQL", ["sql", "select", "join", "group by", "database query"]),
      t("excel", "Excel for data", ["excel", "pivot table", "power query", "xlookup", "vlookup"]),
      t("power-bi", "Power BI", ["power bi", "powerbi", "dax", "dashboard"]),
      t("statistics", "Statistics for data", ["statistics", "hypothesis testing", "regression", "probability distribution"]),
      t("python-data", "Python for data", ["pandas", "numpy", "jupyter", "matplotlib", "seaborn"]),
    ],
  },
  {
    id: "computer-science", name: "Computer Science", school: false, stable: false,
    synonyms: ["cs", "computing"],
    topics: [
      t("data-structures", "Data structures", ["data structure", "linked list", "stack", "queue", "tree", "hash table", "graph"]),
      t("algorithms", "Algorithms", ["algorithm", "big o", "sorting", "searching", "recursion", "dynamic programming"]),
      t("databases", "Databases", ["database", "sql", "normalisation", "normalization", "erd", "entity relationship"]),
      t("networking", "Networking", ["networking", "tcp ip", "osi model", "subnetting", "network"]),
      t("security", "Cyber security", ["cyber security", "cybersecurity", "encryption", "hashing", "authentication"]),
    ],
  },
];

const VIDEO_TYPES = [
  { id: "concept", name: "Understand the concept", keywords: ["explained", "explanation", "introduction", "intro to", "what is", "what are", "understanding", "concept", "basics", "fundamentals", "overview", "made easy", "simplified", "for beginners"] },
  { id: "worked_examples", name: "Worked examples", keywords: ["worked example", "examples", "example", "practice question", "practice problem", "solved", "solving", "step by step", "exercise", "questions and answers", "q and a"] },
  { id: "exam", name: "Exam preparation", keywords: ["exam", "exam question", "past paper", "paper 1", "paper 2", "paper 3", "memo", "memorandum", "final exam", "matric exam", "exam prep", "prelim", "trial exam", "june exam", "november exam", "exam technique", "exam tip"] },
  { id: "revision", name: "Quick revision", keywords: ["revision", "revise", "recap", "summary", "crash course", "cram", "quick", "last minute", "cheat sheet", "everything you need to know", "in 5 minutes", "in 10 minutes"] },
  { id: "lesson", name: "Full lesson", keywords: ["lesson", "full lesson", "lecture", "class", "masterclass", "complete guide", "full course", "full topic"] },
  { id: "tutorial", name: "Practical tutorial", keywords: ["tutorial", "how to", "build", "project", "hands on", "walkthrough", "code along", "demo"] },
];

const LEVELS = [
  { id: "beginner", name: "Beginner", keywords: ["beginner", "for beginners", "basics", "introduction", "from scratch", "fundamentals", "simple", "easy"] },
  { id: "intermediate", name: "Intermediate", keywords: ["intermediate"] },
  { id: "advanced", name: "Advanced", keywords: ["advanced", "deep dive", "expert", "masterclass", "in depth"] },
];

// A request for one curriculum is hurt by clear signals of another (the point of NSC focus).
const CURRICULA = [
  { id: "NSC", name: "South African NSC (CAPS)", keywords: ["nsc", "caps", "matric", "dbe", "national senior certificate", "south africa", "south african", "mzansi"],
    conflicts: ["cbse", "icse", "jee", "neet", "gcse", "igcse", "a level", "as level", "ap calculus", "ap physics", "ap chemistry", "ap biology", "waec", "kcse", "hsc", "class 11", "class 12", "12th grade", "11th grade", "year 11", "year 12", "common core", "sat math", "ib diploma"] },
  { id: "IEB", name: "IEB", keywords: ["ieb", "independent examinations board"],
    conflicts: ["cbse", "icse", "jee", "gcse", "ap calculus", "class 12", "12th grade"] },
  { id: "Cambridge", name: "Cambridge (IGCSE / AS / A level)", keywords: ["cambridge", "igcse", "a level", "as level", "o level"],
    conflicts: ["cbse", "jee", "ap calculus", "nsc", "caps", "matric"] },
  { id: "University", name: "University", keywords: ["university", "varsity", "undergraduate", "first year", "1st year", "semester", "lecture", "college"],
    conflicts: [] },
];

const LANGUAGES = [
  { id: "en", name: "English", hints: [] },
  { id: "af", name: "Afrikaans", hints: ["afrikaans", "graad", "wiskunde", "vraestel", "eksamen", "hersiening", "wetenskappe", "rekeningkunde", "geskiedenis"] },
  { id: "zu", name: "isiZulu", hints: ["isizulu", "ngesizulu"] },
  { id: "xh", name: "isiXhosa", hints: ["isixhosa", "ngesixhosa"] },
  { id: "st", name: "Sesotho", hints: ["sesotho"] },
  { id: "tn", name: "Setswana", hints: ["setswana"] },
  { id: "nso", name: "Sepedi", hints: ["sepedi"] },
];

const LENGTHS = [
  { id: "under_5", name: "Under 5 minutes", min: 0, max: 300 },
  { id: "5_10", name: "5 to 10 minutes", min: 300, max: 600 },
  { id: "10_20", name: "10 to 20 minutes", min: 600, max: 1200 },
  { id: "20_40", name: "20 to 40 minutes", min: 1200, max: 2400 },
  { id: "40_60", name: "40 to 60 minutes", min: 2400, max: 3600 },
  { id: "over_60", name: "Over an hour", min: 3600, max: Infinity },
];

const STUDY_TIMES = [5, 10, 20, 30, 60];

const FEEDBACK_REASONS = {
  useful: [
    { id: "clear", name: "Easy to understand" },
    { id: "good_examples", name: "Good examples" },
    { id: "exam_prep", name: "Good exam preparation" },
  ],
  not_useful: [
    { id: "too_difficult", name: "Too difficult" },
    { id: "too_easy", name: "Too easy" },
    { id: "too_long", name: "Too long" },
    { id: "wrong_topic", name: "Wrong topic" },
    { id: "wrong_curriculum", name: "Wrong curriculum" },
    { id: "wrong_language", name: "Wrong language" },
    { id: "not_exam_focused", name: "Not exam-focused" },
    { id: "unclear", name: "Didn't explain clearly" },
    { id: "not_expected", name: "Not what I expected" },
  ],
};

const SORTS = [
  { id: "recommended", name: "SkillForge recommended" },
  { id: "relevance", name: "Most relevant" },
  { id: "views", name: "Most viewed" },
  { id: "engagement", name: "Highest engagement" },
  { id: "newest", name: "Newest" },
  { id: "shortest", name: "Shortest" },
  { id: "longest", name: "Longest" },
];

/* ------------------------------------------------------------------ lookups */
const byId = (list) => new Map(list.map((x) => [x.id, x]));
const SUBJECT_MAP = byId(SUBJECTS);
const TYPE_MAP = byId(VIDEO_TYPES);
const LEVEL_MAP = byId(LEVELS);
const CURRICULUM_MAP = byId(CURRICULA);
const LANGUAGE_MAP = byId(LANGUAGES);
const LENGTH_MAP = byId(LENGTHS);

function getSubject(id) {
  return SUBJECT_MAP.get(id) || null;
}

function getTopic(subjectId, topicId) {
  const subject = getSubject(subjectId);
  return (subject && subject.topics.find((x) => x.id === topicId)) || null;
}

function getSubtopic(subjectId, topicId, subtopicId) {
  const topic = getTopic(subjectId, topicId);
  return (topic && topic.subtopics.find((x) => x.id === subtopicId)) || null;
}

/** Phrases that identify a subject/topic/subtopic: its name plus synonyms. */
function phrasesOf(node) {
  return node ? [node.name, ...(node.synonyms || [])] : [];
}

// Words too vague to change a search on their own ("graph" could be maths, geography, CAT...).
const AMBIGUOUS = new Set(
  ("graph function class series sequence power force wave light sound network form report query tree stack queue " +
    "scale area volume tax ethics management theme play poem essay email speech inverse limit mole it cat cs js net " +
    "sin cos sine cosine example lesson exam test quality investment insurance map settlement shares").split(" ")
);

/**
 * Guess the subject/topic/subtopic from free text ("how do I solve sin x equations").
 * The longest matching phrase wins; confidence is "high" only for multi-word phrases or
 * exact names, so a stray short word never silently changes the search.
 */
function detectTopic(query, subjectId) {
  const text = stemmedText(query);
  if (!text) return null;
  const subjects = subjectId ? [getSubject(subjectId)].filter(Boolean) : SUBJECTS;
  let best = null;
  const consider = (phrase, hit) => {
    if (!hasPhrase(text, phrase)) return;
    const words = normalize(phrase).split(" ").length;
    const exactName = normalize(phrase) === normalize(hit.node.name);
    const score = words * 10 + (hit.subtopic ? 3 : hit.topic ? 2 : 1) + (exactName ? 2 : 0);
    if (!best || score > best.score) best = { ...hit, phrase, score, confidence: words >= 2 || exactName ? "high" : "low" };
  };
  for (const subject of subjects) {
    for (const p of phrasesOf(subject)) consider(p, { subject: subject.id, node: subject });
    for (const topic of subject.topics) {
      for (const p of phrasesOf(topic)) consider(p, { subject: subject.id, topic: topic.id, node: topic });
      for (const sub of topic.subtopics) {
        for (const p of phrasesOf(sub)) consider(p, { subject: subject.id, topic: topic.id, subtopic: sub.id, node: sub });
      }
    }
  }
  if (!best) return null;

  // Second pass: inside the detected topic, a subtopic's own word ("equation" in "Trigonometric
  // equations", "api" in "APIs") makes the answer more specific: "sin x equations" -> Trig equations.
  if (best.topic && !best.subtopic) {
    const topic = getTopic(best.subject, best.topic);
    const topicWords = new Set(stemmedText(phrasesOf(topic).join(" ")).split(" "));
    for (const sub of topic.subtopics) {
      const own = stemmedText(sub.name).split(" ").filter((w) => w.length > 2 && !topicWords.has(w));
      const hit = phrasesOf(sub).find((p) => hasPhrase(text, p)) || (own.length && own.every((w) => hasPhrase(text, w)) && own.join(" "));
      if (hit) {
        best = { ...best, subtopic: sub.id, node: sub, phrase: `${best.phrase} + ${hit}`, confidence: "high" };
        break;
      }
    }
  }
  if (best.confidence === "low" && !AMBIGUOUS.has(normalize(best.phrase))) best.confidence = "high";
  const { node, score, ...rest } = best;
  return { ...rest, name: node.name };
}

/**
 * Every phrase that shows a video is about this subject: its own names plus all its topics and
 * subtopics ("trig equations" is maths even if it never says "maths"). Vague single words
 * ("graph", "power", "area") are left out, so a Power BI video never passes as maths.
 */
const vocabularyCache = new Map();
function subjectVocabulary(subjectId) {
  if (vocabularyCache.has(subjectId)) return vocabularyCache.get(subjectId);
  const subject = getSubject(subjectId);
  const phrases = subject
    ? [subject, ...subject.topics, ...subject.topics.flatMap((t) => t.subtopics)].flatMap(phrasesOf)
    : [];
  const out = [...new Set(phrases)].filter((p) => !AMBIGUOUS.has(normalize(p)));
  vocabularyCache.set(subjectId, out);
  return out;
}

/** Related topics: siblings under the same subject (and sibling subtopics first when given). */
function relatedTopics(subjectId, topicId, subtopicId, limit = 5) {
  const subject = getSubject(subjectId);
  if (!subject) return [];
  const out = [];
  const topic = topicId && getTopic(subjectId, topicId);
  if (topic && subtopicId) {
    for (const sub of topic.subtopics) if (sub.id !== subtopicId) out.push({ topic: topic.id, subtopic: sub.id, name: sub.name });
  }
  for (const other of subject.topics) {
    if (other.id !== topicId) out.push({ topic: other.id, name: other.name });
  }
  return out.slice(0, limit);
}

/** The menus the page needs, in one payload. */
function publicTaxonomy() {
  return {
    subjects: SUBJECTS.map((subj) => ({
      id: subj.id,
      name: subj.name,
      school: subj.school,
      grades: subj.grades || [],
      topics: subj.topics.map((tp) => ({ id: tp.id, name: tp.name, subtopics: tp.subtopics.map((st) => ({ id: st.id, name: st.name })) })),
    })),
    curricula: CURRICULA.map(({ id, name }) => ({ id, name })),
    levels: LEVELS.map(({ id, name }) => ({ id, name })),
    video_types: VIDEO_TYPES.map(({ id, name }) => ({ id, name })),
    lengths: LENGTHS.map(({ id, name }) => ({ id, name })),
    study_times: STUDY_TIMES,
    languages: LANGUAGES.map(({ id, name }) => ({ id, name })),
    sorts: SORTS,
    feedback_reasons: FEEDBACK_REASONS,
  };
}

module.exports = {
  SUBJECTS, VIDEO_TYPES, LEVELS, CURRICULA, LANGUAGES, LENGTHS, STUDY_TIMES, FEEDBACK_REASONS, SORTS,
  TYPE_MAP, LEVEL_MAP, CURRICULUM_MAP, LANGUAGE_MAP, LENGTH_MAP,
  getSubject, getTopic, getSubtopic, phrasesOf, detectTopic, subjectVocabulary, relatedTopics, publicTaxonomy,
};
