"""
SkillForge Career Discovery - domain / background mappings.

Everything here is expressed in real O*NET element IDs. Element *names* are
never used for matching: they only exist as comments and are re-read at runtime
from content_model_reference so that a typo shows up as a startup warning
instead of a silently dead mapping (§16, §39).

Element ID families:
    1.A.*   Abilities
    1.B.1.* Interests (RIASEC)
    1.D.*   Work Styles (this database; standard O*NET uses 1.C.*)
    2.A.*   Basic Skills      2.B.* Cross-functional Skills
    2.C.*   Knowledge
    4.A.*   Work Activities
"""

from __future__ import annotations

from typing import Dict, List

# ---------------------------------------------------------------------------
# RIASEC
# ---------------------------------------------------------------------------

RIASEC_ELEMENTS: Dict[str, str] = {
    "realistic": "1.B.1.a",
    "investigative": "1.B.1.b",
    "artistic": "1.B.1.c",
    "social": "1.B.1.d",
    "enterprising": "1.B.1.e",
    "conventional": "1.B.1.f",
}
RIASEC_KEYS: List[str] = list(RIASEC_ELEMENTS.keys())
ELEMENT_TO_RIASEC: Dict[str, str] = {v: k for k, v in RIASEC_ELEMENTS.items()}


# ---------------------------------------------------------------------------
# Named element constants (readable references used by the question bank)
# ---------------------------------------------------------------------------

# --- Knowledge (2.C.*) -----------------------------------------------------
K_ADMIN_MANAGEMENT = "2.C.1.a"      # Administration and Management
K_ADMINISTRATIVE = "2.C.1.b"        # Administrative
K_ECONOMICS_ACCOUNTING = "2.C.1.c"  # Economics and Accounting
K_SALES_MARKETING = "2.C.1.d"       # Sales and Marketing
K_CUSTOMER_SERVICE = "2.C.1.e"      # Customer and Personal Service
K_HR = "2.C.1.f"                    # Personnel and Human Resources
K_COMPUTERS_ELECTRONICS = "2.C.3.a" # Computers and Electronics
K_ENGINEERING_TECH = "2.C.3.b"      # Engineering and Technology
K_DESIGN = "2.C.3.c"                # Design
K_MECHANICAL = "2.C.3.e"            # Mechanical
K_MATHEMATICS = "2.C.4.a"           # Mathematics
K_PHYSICS = "2.C.4.b"               # Physics
K_CHEMISTRY = "2.C.4.c"             # Chemistry
K_BIOLOGY = "2.C.4.d"               # Biology
K_PSYCHOLOGY = "2.C.4.e"            # Psychology
K_SOCIOLOGY = "2.C.4.f"             # Sociology and Anthropology
K_GEOGRAPHY = "2.C.4.g"             # Geography
K_MEDICINE = "2.C.5.a"              # Medicine and Dentistry
K_THERAPY = "2.C.5.b"               # Therapy and Counseling
K_EDUCATION_TRAINING = "2.C.6"      # Education and Training
K_ENGLISH = "2.C.7.a"               # English Language
K_FINE_ARTS = "2.C.7.c"             # Fine Arts
K_HISTORY = "2.C.7.d"               # History and Archeology
K_LAW_GOVERNMENT = "2.C.8.b"        # Law and Government
K_TELECOMMUNICATIONS = "2.C.9.a"    # Telecommunications
K_COMMUNICATIONS_MEDIA = "2.C.9.b"  # Communications and Media

# --- Skills (2.A.* / 2.B.*) ------------------------------------------------
S_READING = "2.A.1.a"               # Reading Comprehension
S_WRITING = "2.A.1.c"               # Writing
S_SPEAKING = "2.A.1.d"              # Speaking
S_MATHEMATICS = "2.A.1.e"           # Mathematics
S_SCIENCE = "2.A.1.f"               # Science
S_CRITICAL_THINKING = "2.A.2.a"     # Critical Thinking
S_ACTIVE_LEARNING = "2.A.2.b"       # Active Learning
S_SOCIAL_PERCEPTIVENESS = "2.B.1.a" # Social Perceptiveness
S_COORDINATION = "2.B.1.b"          # Coordination
S_PERSUASION = "2.B.1.c"            # Persuasion
S_NEGOTIATION = "2.B.1.d"           # Negotiation
S_INSTRUCTING = "2.B.1.e"           # Instructing
S_SERVICE_ORIENTATION = "2.B.1.f"   # Service Orientation
S_COMPLEX_PROBLEM_SOLVING = "2.B.2.i"
S_OPERATIONS_ANALYSIS = "2.B.3.a"   # Operations Analysis
S_TECHNOLOGY_DESIGN = "2.B.3.b"     # Technology Design
S_PROGRAMMING = "2.B.3.e"           # Programming
S_QUALITY_CONTROL = "2.B.3.m"       # Quality Control Analysis
S_TROUBLESHOOTING = "2.B.3.k"       # Troubleshooting
S_JUDGEMENT_DECISION = "2.B.4.e"    # Judgment and Decision Making
S_SYSTEMS_ANALYSIS = "2.B.4.g"      # Systems Analysis
S_SYSTEMS_EVALUATION = "2.B.4.h"    # Systems Evaluation
S_TIME_MANAGEMENT = "2.B.5.a"       # Time Management
S_MANAGE_FINANCIAL = "2.B.5.b"      # Management of Financial Resources
S_MANAGE_PERSONNEL = "2.B.5.d"      # Management of Personnel Resources

# --- Abilities (1.A.*) -----------------------------------------------------
A_ORAL_COMPREHENSION = "1.A.1.a.1"
A_WRITTEN_COMPREHENSION = "1.A.1.a.2"
A_ORAL_EXPRESSION = "1.A.1.a.3"
A_WRITTEN_EXPRESSION = "1.A.1.a.4"
A_FLUENCY_OF_IDEAS = "1.A.1.b.1"
A_ORIGINALITY = "1.A.1.b.2"
A_PROBLEM_SENSITIVITY = "1.A.1.b.3"
A_DEDUCTIVE_REASONING = "1.A.1.b.4"
A_INDUCTIVE_REASONING = "1.A.1.b.5"
A_INFORMATION_ORDERING = "1.A.1.b.6"
A_CATEGORY_FLEXIBILITY = "1.A.1.b.7"
A_MATHEMATICAL_REASONING = "1.A.1.c.1"
A_NUMBER_FACILITY = "1.A.1.c.2"
A_MEMORIZATION = "1.A.1.d.1"
A_FLEXIBILITY_OF_CLOSURE = "1.A.1.e.2"
A_PERCEPTUAL_SPEED = "1.A.1.e.3"
A_VISUALIZATION = "1.A.1.f.2"
A_SELECTIVE_ATTENTION = "1.A.1.g.1"
A_MANUAL_DEXTERITY = "1.A.2.a.2"

# --- Work Activities (4.A.*) ----------------------------------------------
W_GETTING_INFORMATION = "4.A.1.a.1"
W_IDENTIFYING_OBJECTS = "4.A.1.b.1"
W_PROCESSING_INFORMATION = "4.A.2.a.2"
W_ANALYZING_DATA = "4.A.2.a.4"
W_DECISIONS_PROBLEMS = "4.A.2.b.1"
W_THINKING_CREATIVELY = "4.A.2.b.2"
W_UPDATING_KNOWLEDGE = "4.A.2.b.3"
W_DEVELOPING_OBJECTIVES = "4.A.2.b.4"
W_ORGANIZING_PLANNING = "4.A.2.b.6"
W_WORKING_WITH_COMPUTERS = "4.A.3.b.1"
W_DRAFTING_SPECIFYING = "4.A.3.b.2"
W_DOCUMENTING_RECORDING = "4.A.3.b.6"
W_INTERPRETING_FOR_OTHERS = "4.A.4.a.1"
W_COMMUNICATING_INTERNAL = "4.A.4.a.2"
W_COMMUNICATING_EXTERNAL = "4.A.4.a.3"
W_BUILDING_RELATIONSHIPS = "4.A.4.a.4"
W_ASSISTING_CARING = "4.A.4.a.5"
W_SELLING_INFLUENCING = "4.A.4.a.6"
W_WORKING_WITH_PUBLIC = "4.A.4.a.8"
W_COORDINATING_OTHERS = "4.A.4.b.1"
W_DEVELOPING_TEAMS = "4.A.4.b.2"
W_TRAINING_TEACHING = "4.A.4.b.3"
W_GUIDING_DIRECTING = "4.A.4.b.4"
W_CONSULTING_ADVISING = "4.A.4.b.6"
W_ADMINISTRATIVE_ACTIVITIES = "4.A.4.c.1"

# --- Work Styles (1.D.* in this database) ----------------------------------
# Standard O*NET files work styles under 1.C.* with seven groups. This
# database uses a 21-element 1.D.* taxonomy instead, so each constant points at
# the nearest equivalent element that actually exists in content_model_reference.
# Names on the right are the element_name values from that table.
WS_ACHIEVEMENT = "1.D.1.b"          # Achievement Orientation
WS_PERSISTENCE = "1.D.1.h"          # Perseverance
WS_INITIATIVE = "1.D.1.e"           # Initiative
WS_LEADERSHIP = "1.D.1.i"           # Leadership Orientation
WS_COOPERATION = "1.D.2.d"          # Cooperation
WS_CONCERN_FOR_OTHERS = "1.D.2.c"   # Empathy
WS_SOCIAL_ORIENTATION = "1.D.2.f"   # Social Orientation
WS_SELF_CONTROL = "1.D.4.b"         # Self-Control
WS_STRESS_TOLERANCE = "1.D.4.a"     # Stress Tolerance
WS_ADAPTABILITY = "1.D.1.f"         # Adaptability
WS_DEPENDABILITY = "1.D.3.c"        # Dependability
WS_ATTENTION_TO_DETAIL = "1.D.3.b"  # Attention to Detail
WS_INTEGRITY = "1.D.3.d"            # Integrity
WS_INNOVATION = "1.D.1.a"           # Innovation
WS_ANALYTICAL_THINKING = "1.D.1.c"  # Intellectual Curiosity (nearest match)
# O*NET's Independence (1.C.6) has no counterpart in this taxonomy.
# Self-Confidence is the closest available proxy for self-directed working.
WS_INDEPENDENCE = "1.D.1.g"         # Self-Confidence (proxy for Independence)

# Present in this database with no O*NET work-style equivalent.
WS_TOLERANCE_AMBIGUITY = "1.D.1.d"  # Tolerance for Ambiguity
WS_HUMILITY = "1.D.2.a"             # Humility
WS_SINCERITY = "1.D.2.b"            # Sincerity
WS_OPTIMISM = "1.D.2.e"             # Optimism
WS_CAUTIOUSNESS = "1.D.3.a"         # Cautiousness


# ---------------------------------------------------------------------------
# Domain prototypes (§16, §39)
# ---------------------------------------------------------------------------
# A domain is a weighted O*NET element profile, not a list of job titles. Domain
# fitness for an occupation = weighted mean of that occupation's percentile
# ranks over these elements. Weights are relative within a domain.

DOMAIN_PROFILES: Dict[str, Dict[str, Dict[str, float]]] = {
    "tech": {
        "interests": {RIASEC_ELEMENTS["investigative"]: 1.0,
                      RIASEC_ELEMENTS["realistic"]: 0.6,
                      RIASEC_ELEMENTS["conventional"]: 0.3},
        "knowledge": {K_COMPUTERS_ELECTRONICS: 1.0, K_ENGINEERING_TECH: 0.6,
                      K_MATHEMATICS: 0.5, K_TELECOMMUNICATIONS: 0.3},
        "skills": {S_PROGRAMMING: 1.0, S_SYSTEMS_ANALYSIS: 0.7,
                   S_COMPLEX_PROBLEM_SOLVING: 0.6, S_TROUBLESHOOTING: 0.5,
                   S_TECHNOLOGY_DESIGN: 0.5, S_OPERATIONS_ANALYSIS: 0.4},
        "work_activities": {W_WORKING_WITH_COMPUTERS: 1.0,
                            W_DECISIONS_PROBLEMS: 0.5,
                            W_PROCESSING_INFORMATION: 0.4,
                            W_UPDATING_KNOWLEDGE: 0.3},
        "abilities": {A_DEDUCTIVE_REASONING: 0.7, A_INFORMATION_ORDERING: 0.6,
                      A_PROBLEM_SENSITIVITY: 0.5},
        "work_styles": {WS_ANALYTICAL_THINKING: 0.8, WS_ATTENTION_TO_DETAIL: 0.5,
                        WS_INDEPENDENCE: 0.4},
    },
    "data": {
        "interests": {RIASEC_ELEMENTS["investigative"]: 1.0,
                      RIASEC_ELEMENTS["conventional"]: 0.7},
        "knowledge": {K_MATHEMATICS: 1.0, K_COMPUTERS_ELECTRONICS: 0.8,
                      K_ECONOMICS_ACCOUNTING: 0.3, K_ENGLISH: 0.2},
        "skills": {S_MATHEMATICS: 1.0, S_CRITICAL_THINKING: 0.7,
                   S_SYSTEMS_EVALUATION: 0.5, S_PROGRAMMING: 0.5,
                   S_QUALITY_CONTROL: 0.4},
        "work_activities": {W_ANALYZING_DATA: 1.0, W_PROCESSING_INFORMATION: 0.8,
                            W_WORKING_WITH_COMPUTERS: 0.6,
                            W_GETTING_INFORMATION: 0.4,
                            W_INTERPRETING_FOR_OTHERS: 0.4},
        "abilities": {A_MATHEMATICAL_REASONING: 0.9, A_NUMBER_FACILITY: 0.7,
                      A_INDUCTIVE_REASONING: 0.6, A_INFORMATION_ORDERING: 0.5},
        "work_styles": {WS_ANALYTICAL_THINKING: 1.0, WS_ATTENTION_TO_DETAIL: 0.7},
    },
    "design": {
        "interests": {RIASEC_ELEMENTS["artistic"]: 1.0,
                      RIASEC_ELEMENTS["investigative"]: 0.4,
                      RIASEC_ELEMENTS["enterprising"]: 0.2},
        "knowledge": {K_DESIGN: 1.0, K_FINE_ARTS: 0.6,
                      K_COMMUNICATIONS_MEDIA: 0.5, K_COMPUTERS_ELECTRONICS: 0.4,
                      K_PSYCHOLOGY: 0.3},
        "skills": {S_OPERATIONS_ANALYSIS: 0.6, S_CRITICAL_THINKING: 0.5,
                   S_COMPLEX_PROBLEM_SOLVING: 0.5, S_SOCIAL_PERCEPTIVENESS: 0.4,
                   S_ACTIVE_LEARNING: 0.3},
        "work_activities": {W_THINKING_CREATIVELY: 1.0,
                            W_DRAFTING_SPECIFYING: 0.7,
                            W_WORKING_WITH_COMPUTERS: 0.5,
                            W_GETTING_INFORMATION: 0.4,
                            W_COMMUNICATING_EXTERNAL: 0.3},
        "abilities": {A_ORIGINALITY: 0.9, A_FLUENCY_OF_IDEAS: 0.8,
                      A_VISUALIZATION: 0.7, A_FLEXIBILITY_OF_CLOSURE: 0.3},
        "work_styles": {WS_INNOVATION: 1.0, WS_ADAPTABILITY: 0.5,
                        WS_INITIATIVE: 0.4},
    },
    "business": {
        "interests": {RIASEC_ELEMENTS["enterprising"]: 1.0,
                      RIASEC_ELEMENTS["conventional"]: 0.6,
                      RIASEC_ELEMENTS["social"]: 0.3},
        "knowledge": {K_ADMIN_MANAGEMENT: 1.0, K_ECONOMICS_ACCOUNTING: 0.8,
                      K_SALES_MARKETING: 0.6, K_HR: 0.4, K_CUSTOMER_SERVICE: 0.4,
                      K_LAW_GOVERNMENT: 0.2},
        "skills": {S_JUDGEMENT_DECISION: 0.9, S_MANAGE_FINANCIAL: 0.7,
                   S_NEGOTIATION: 0.6, S_PERSUASION: 0.6,
                   S_MANAGE_PERSONNEL: 0.6, S_TIME_MANAGEMENT: 0.4},
        "work_activities": {W_DEVELOPING_OBJECTIVES: 1.0,
                            W_COORDINATING_OTHERS: 0.7,
                            W_COMMUNICATING_EXTERNAL: 0.6,
                            W_GUIDING_DIRECTING: 0.6,
                            W_ORGANIZING_PLANNING: 0.5,
                            W_SELLING_INFLUENCING: 0.4},
        "abilities": {A_ORAL_EXPRESSION: 0.7, A_ORAL_COMPREHENSION: 0.5,
                      A_DEDUCTIVE_REASONING: 0.4},
        "work_styles": {WS_LEADERSHIP: 1.0, WS_INITIATIVE: 0.7,
                        WS_ACHIEVEMENT: 0.5, WS_STRESS_TOLERANCE: 0.3},
    },
    "creative": {
        "interests": {RIASEC_ELEMENTS["artistic"]: 1.0,
                      RIASEC_ELEMENTS["enterprising"]: 0.3,
                      RIASEC_ELEMENTS["social"]: 0.2},
        "knowledge": {K_COMMUNICATIONS_MEDIA: 1.0, K_FINE_ARTS: 0.8,
                      K_ENGLISH: 0.5, K_DESIGN: 0.5, K_SALES_MARKETING: 0.3},
        "skills": {S_WRITING: 0.8, S_SPEAKING: 0.5, S_ACTIVE_LEARNING: 0.4,
                   S_SOCIAL_PERCEPTIVENESS: 0.4, S_TIME_MANAGEMENT: 0.3},
        "work_activities": {W_THINKING_CREATIVELY: 1.0,
                            W_COMMUNICATING_EXTERNAL: 0.6,
                            W_INTERPRETING_FOR_OTHERS: 0.5,
                            W_GETTING_INFORMATION: 0.4},
        "abilities": {A_ORIGINALITY: 0.9, A_FLUENCY_OF_IDEAS: 0.8,
                      A_WRITTEN_EXPRESSION: 0.6, A_ORAL_EXPRESSION: 0.4},
        "work_styles": {WS_INNOVATION: 1.0, WS_INITIATIVE: 0.5,
                        WS_ADAPTABILITY: 0.4},
    },
    # --- added domains -----------------------------------------------------
    "science": {
        "interests": {RIASEC_ELEMENTS["investigative"]: 1.0,
                      RIASEC_ELEMENTS["realistic"]: 0.4},
        "knowledge": {K_BIOLOGY: 0.8, K_CHEMISTRY: 0.8, K_PHYSICS: 0.7,
                      K_MATHEMATICS: 0.6, K_ENGLISH: 0.3},
        "skills": {S_SCIENCE: 1.0, S_CRITICAL_THINKING: 0.7,
                   S_ACTIVE_LEARNING: 0.6, S_MATHEMATICS: 0.5,
                   S_COMPLEX_PROBLEM_SOLVING: 0.5, S_WRITING: 0.4},
        "work_activities": {W_GETTING_INFORMATION: 0.8, W_ANALYZING_DATA: 0.8,
                            W_UPDATING_KNOWLEDGE: 0.6,
                            W_PROCESSING_INFORMATION: 0.5,
                            W_DOCUMENTING_RECORDING: 0.4},
        "abilities": {A_INDUCTIVE_REASONING: 0.8, A_DEDUCTIVE_REASONING: 0.7,
                      A_PROBLEM_SENSITIVITY: 0.6, A_WRITTEN_COMPREHENSION: 0.5},
        "work_styles": {WS_ANALYTICAL_THINKING: 1.0, WS_ATTENTION_TO_DETAIL: 0.7,
                        WS_PERSISTENCE: 0.6, WS_INNOVATION: 0.5},
    },
    "health": {
        "interests": {RIASEC_ELEMENTS["social"]: 0.9,
                      RIASEC_ELEMENTS["investigative"]: 0.9,
                      RIASEC_ELEMENTS["realistic"]: 0.4},
        "knowledge": {K_MEDICINE: 1.0, K_BIOLOGY: 0.7, K_THERAPY: 0.7,
                      K_PSYCHOLOGY: 0.5, K_CUSTOMER_SERVICE: 0.4,
                      K_CHEMISTRY: 0.3},
        "skills": {S_SERVICE_ORIENTATION: 0.8, S_SOCIAL_PERCEPTIVENESS: 0.7,
                   S_CRITICAL_THINKING: 0.7, S_ACTIVE_LEARNING: 0.6,
                   S_JUDGEMENT_DECISION: 0.6, S_SCIENCE: 0.5},
        "work_activities": {W_ASSISTING_CARING: 1.0, W_GETTING_INFORMATION: 0.6,
                            W_DOCUMENTING_RECORDING: 0.5,
                            W_CONSULTING_ADVISING: 0.5,
                            W_IDENTIFYING_OBJECTS: 0.4},
        "abilities": {A_PROBLEM_SENSITIVITY: 0.8, A_ORAL_COMPREHENSION: 0.6,
                      A_DEDUCTIVE_REASONING: 0.6, A_SELECTIVE_ATTENTION: 0.5},
        "work_styles": {WS_CONCERN_FOR_OTHERS: 1.0, WS_DEPENDABILITY: 0.8,
                        WS_STRESS_TOLERANCE: 0.7, WS_INTEGRITY: 0.6},
    },
    "engineering": {
        "interests": {RIASEC_ELEMENTS["realistic"]: 1.0,
                      RIASEC_ELEMENTS["investigative"]: 0.8},
        "knowledge": {K_ENGINEERING_TECH: 1.0, K_MECHANICAL: 0.8,
                      K_PHYSICS: 0.6, K_MATHEMATICS: 0.6, K_DESIGN: 0.4},
        "skills": {S_COMPLEX_PROBLEM_SOLVING: 0.8, S_TROUBLESHOOTING: 0.7,
                   S_TECHNOLOGY_DESIGN: 0.7, S_QUALITY_CONTROL: 0.6,
                   S_OPERATIONS_ANALYSIS: 0.6, S_MATHEMATICS: 0.5},
        "work_activities": {W_DRAFTING_SPECIFYING: 0.9,
                            W_IDENTIFYING_OBJECTS: 0.6,
                            W_DECISIONS_PROBLEMS: 0.6, W_ANALYZING_DATA: 0.5,
                            W_ORGANIZING_PLANNING: 0.4},
        "abilities": {A_VISUALIZATION: 0.8, A_MATHEMATICAL_REASONING: 0.7,
                      A_PROBLEM_SENSITIVITY: 0.6, A_DEDUCTIVE_REASONING: 0.6},
        "work_styles": {WS_ANALYTICAL_THINKING: 0.8, WS_ATTENTION_TO_DETAIL: 0.8,
                        WS_DEPENDABILITY: 0.6, WS_INNOVATION: 0.5},
    },
    "finance": {
        "interests": {RIASEC_ELEMENTS["conventional"]: 1.0,
                      RIASEC_ELEMENTS["enterprising"]: 0.7,
                      RIASEC_ELEMENTS["investigative"]: 0.5},
        "knowledge": {K_ECONOMICS_ACCOUNTING: 1.0, K_MATHEMATICS: 0.7,
                      K_ADMIN_MANAGEMENT: 0.5, K_LAW_GOVERNMENT: 0.4,
                      K_COMPUTERS_ELECTRONICS: 0.3},
        "skills": {S_MANAGE_FINANCIAL: 1.0, S_MATHEMATICS: 0.7,
                   S_CRITICAL_THINKING: 0.6, S_JUDGEMENT_DECISION: 0.6,
                   S_SYSTEMS_EVALUATION: 0.5, S_READING: 0.4},
        "work_activities": {W_ANALYZING_DATA: 0.9,
                            W_PROCESSING_INFORMATION: 0.7,
                            W_DOCUMENTING_RECORDING: 0.5,
                            W_CONSULTING_ADVISING: 0.5,
                            W_DECISIONS_PROBLEMS: 0.5},
        "abilities": {A_MATHEMATICAL_REASONING: 0.9, A_NUMBER_FACILITY: 0.8,
                      A_DEDUCTIVE_REASONING: 0.6, A_INFORMATION_ORDERING: 0.5},
        "work_styles": {WS_ATTENTION_TO_DETAIL: 1.0, WS_INTEGRITY: 0.8,
                        WS_ANALYTICAL_THINKING: 0.8, WS_DEPENDABILITY: 0.6},
    },
    "law": {
        "interests": {RIASEC_ELEMENTS["enterprising"]: 0.8,
                      RIASEC_ELEMENTS["investigative"]: 0.7,
                      RIASEC_ELEMENTS["conventional"]: 0.5},
        "knowledge": {K_LAW_GOVERNMENT: 1.0, K_ENGLISH: 0.7,
                      K_ADMIN_MANAGEMENT: 0.4, K_SOCIOLOGY: 0.4,
                      K_ECONOMICS_ACCOUNTING: 0.3},
        "skills": {S_READING: 0.9, S_CRITICAL_THINKING: 0.9, S_WRITING: 0.8,
                   S_SPEAKING: 0.7, S_NEGOTIATION: 0.6,
                   S_JUDGEMENT_DECISION: 0.6},
        "work_activities": {W_GETTING_INFORMATION: 0.8,
                            W_INTERPRETING_FOR_OTHERS: 0.7,
                            W_DOCUMENTING_RECORDING: 0.7,
                            W_COMMUNICATING_EXTERNAL: 0.6,
                            W_DECISIONS_PROBLEMS: 0.5},
        "abilities": {A_WRITTEN_COMPREHENSION: 0.9, A_WRITTEN_EXPRESSION: 0.8,
                      A_DEDUCTIVE_REASONING: 0.8, A_ORAL_EXPRESSION: 0.6},
        "work_styles": {WS_INTEGRITY: 1.0, WS_ATTENTION_TO_DETAIL: 0.8,
                        WS_ANALYTICAL_THINKING: 0.7, WS_PERSISTENCE: 0.5},
    },
    "education": {
        "interests": {RIASEC_ELEMENTS["social"]: 1.0,
                      RIASEC_ELEMENTS["artistic"]: 0.3,
                      RIASEC_ELEMENTS["investigative"]: 0.3},
        "knowledge": {K_EDUCATION_TRAINING: 1.0, K_ENGLISH: 0.6,
                      K_PSYCHOLOGY: 0.5, K_SOCIOLOGY: 0.3},
        "skills": {S_INSTRUCTING: 1.0, S_ACTIVE_LEARNING: 0.7,
                   S_SPEAKING: 0.7, S_SOCIAL_PERCEPTIVENESS: 0.6,
                   S_SERVICE_ORIENTATION: 0.5, S_TIME_MANAGEMENT: 0.4},
        "work_activities": {W_TRAINING_TEACHING: 1.0,
                            W_COMMUNICATING_INTERNAL: 0.6,
                            W_DEVELOPING_OBJECTIVES: 0.5,
                            W_GUIDING_DIRECTING: 0.5, W_ASSISTING_CARING: 0.4},
        "abilities": {A_ORAL_EXPRESSION: 0.9, A_ORAL_COMPREHENSION: 0.7,
                      A_WRITTEN_EXPRESSION: 0.5},
        "work_styles": {WS_CONCERN_FOR_OTHERS: 0.8, WS_DEPENDABILITY: 0.7,
                        WS_ADAPTABILITY: 0.6, WS_INITIATIVE: 0.5},
    },
    "arts": {
        "interests": {RIASEC_ELEMENTS["artistic"]: 1.0,
                      RIASEC_ELEMENTS["social"]: 0.3},
        "knowledge": {K_FINE_ARTS: 1.0, K_HISTORY: 0.5, K_ENGLISH: 0.4,
                      K_COMMUNICATIONS_MEDIA: 0.4, K_DESIGN: 0.4},
        "skills": {S_ACTIVE_LEARNING: 0.5, S_CRITICAL_THINKING: 0.5,
                   S_WRITING: 0.5, S_SPEAKING: 0.4, S_COORDINATION: 0.4},
        "work_activities": {W_THINKING_CREATIVELY: 1.0,
                            W_GETTING_INFORMATION: 0.5,
                            W_COMMUNICATING_EXTERNAL: 0.4,
                            W_DOCUMENTING_RECORDING: 0.3},
        "abilities": {A_ORIGINALITY: 0.9, A_FLUENCY_OF_IDEAS: 0.8,
                      A_VISUALIZATION: 0.5, A_MEMORIZATION: 0.3},
        "work_styles": {WS_INNOVATION: 1.0, WS_PERSISTENCE: 0.6,
                        WS_INDEPENDENCE: 0.5},
    },
    "social": {
        "interests": {RIASEC_ELEMENTS["investigative"]: 0.8,
                      RIASEC_ELEMENTS["social"]: 0.8,
                      RIASEC_ELEMENTS["artistic"]: 0.3},
        "knowledge": {K_SOCIOLOGY: 1.0, K_PSYCHOLOGY: 0.8, K_HISTORY: 0.6,
                      K_ENGLISH: 0.5, K_GEOGRAPHY: 0.4},
        "skills": {S_CRITICAL_THINKING: 0.8, S_WRITING: 0.7, S_READING: 0.7,
                   S_SOCIAL_PERCEPTIVENESS: 0.6, S_ACTIVE_LEARNING: 0.6},
        "work_activities": {W_GETTING_INFORMATION: 0.8, W_ANALYZING_DATA: 0.6,
                            W_INTERPRETING_FOR_OTHERS: 0.6,
                            W_DOCUMENTING_RECORDING: 0.5,
                            W_CONSULTING_ADVISING: 0.4},
        "abilities": {A_WRITTEN_COMPREHENSION: 0.8, A_WRITTEN_EXPRESSION: 0.7,
                      A_INDUCTIVE_REASONING: 0.6, A_CATEGORY_FLEXIBILITY: 0.4},
        "work_styles": {WS_ANALYTICAL_THINKING: 0.7, WS_PERSISTENCE: 0.6,
                        WS_CONCERN_FOR_OTHERS: 0.6, WS_INDEPENDENCE: 0.5},
    },
    "environment": {
        "interests": {RIASEC_ELEMENTS["investigative"]: 0.9,
                      RIASEC_ELEMENTS["realistic"]: 0.7,
                      RIASEC_ELEMENTS["social"]: 0.3},
        "knowledge": {K_BIOLOGY: 0.9, K_GEOGRAPHY: 0.8, K_CHEMISTRY: 0.6,
                      K_ENGINEERING_TECH: 0.4, K_LAW_GOVERNMENT: 0.3},
        "skills": {S_SCIENCE: 0.9, S_CRITICAL_THINKING: 0.6,
                   S_COMPLEX_PROBLEM_SOLVING: 0.5, S_SYSTEMS_ANALYSIS: 0.5,
                   S_WRITING: 0.4},
        "work_activities": {W_GETTING_INFORMATION: 0.8, W_ANALYZING_DATA: 0.7,
                            W_IDENTIFYING_OBJECTS: 0.6,
                            W_DOCUMENTING_RECORDING: 0.5,
                            W_CONSULTING_ADVISING: 0.4},
        "abilities": {A_INDUCTIVE_REASONING: 0.7, A_PROBLEM_SENSITIVITY: 0.6,
                      A_FLEXIBILITY_OF_CLOSURE: 0.4},
        "work_styles": {WS_ANALYTICAL_THINKING: 0.7, WS_PERSISTENCE: 0.6,
                        WS_ATTENTION_TO_DETAIL: 0.6, WS_INTEGRITY: 0.5},
    },
    "architecture": {
        "interests": {RIASEC_ELEMENTS["realistic"]: 0.9,
                      RIASEC_ELEMENTS["artistic"]: 0.6,
                      RIASEC_ELEMENTS["enterprising"]: 0.3},
        "knowledge": {K_DESIGN: 1.0, K_ENGINEERING_TECH: 0.8,
                      K_MECHANICAL: 0.5, K_MATHEMATICS: 0.5,
                      K_ADMIN_MANAGEMENT: 0.3},
        "skills": {S_TECHNOLOGY_DESIGN: 0.7, S_COMPLEX_PROBLEM_SOLVING: 0.6,
                   S_COORDINATION: 0.6, S_QUALITY_CONTROL: 0.5,
                   S_TIME_MANAGEMENT: 0.4},
        "work_activities": {W_DRAFTING_SPECIFYING: 1.0,
                            W_ORGANIZING_PLANNING: 0.7,
                            W_COORDINATING_OTHERS: 0.5,
                            W_IDENTIFYING_OBJECTS: 0.5,
                            W_THINKING_CREATIVELY: 0.5},
        "abilities": {A_VISUALIZATION: 1.0, A_PROBLEM_SENSITIVITY: 0.5,
                      A_MATHEMATICAL_REASONING: 0.5, A_ORIGINALITY: 0.4},
        "work_styles": {WS_ATTENTION_TO_DETAIL: 0.8, WS_DEPENDABILITY: 0.7,
                        WS_INNOVATION: 0.5, WS_COOPERATION: 0.5},
    },
    "energy": {
        "interests": {RIASEC_ELEMENTS["realistic"]: 1.0,
                      RIASEC_ELEMENTS["investigative"]: 0.5,
                      RIASEC_ELEMENTS["conventional"]: 0.3},
        "knowledge": {K_MECHANICAL: 1.0, K_ENGINEERING_TECH: 0.8,
                      K_PHYSICS: 0.5, K_TELECOMMUNICATIONS: 0.3},
        "skills": {S_TROUBLESHOOTING: 1.0, S_QUALITY_CONTROL: 0.7,
                   S_OPERATIONS_ANALYSIS: 0.6, S_SYSTEMS_EVALUATION: 0.5,
                   S_COMPLEX_PROBLEM_SOLVING: 0.5},
        "work_activities": {W_IDENTIFYING_OBJECTS: 0.8,
                            W_DECISIONS_PROBLEMS: 0.6,
                            W_DOCUMENTING_RECORDING: 0.4,
                            W_ORGANIZING_PLANNING: 0.4,
                            W_UPDATING_KNOWLEDGE: 0.4},
        "abilities": {A_PROBLEM_SENSITIVITY: 0.8, A_DEDUCTIVE_REASONING: 0.6,
                      A_MANUAL_DEXTERITY: 0.5, A_SELECTIVE_ATTENTION: 0.5},
        "work_styles": {WS_DEPENDABILITY: 0.9, WS_ATTENTION_TO_DETAIL: 0.8,
                        WS_STRESS_TOLERANCE: 0.6, WS_SELF_CONTROL: 0.5},
    },
    "logistics": {
        "interests": {RIASEC_ELEMENTS["conventional"]: 0.9,
                      RIASEC_ELEMENTS["realistic"]: 0.8,
                      RIASEC_ELEMENTS["enterprising"]: 0.4},
        "knowledge": {K_ADMIN_MANAGEMENT: 0.7, K_GEOGRAPHY: 0.6,
                      K_MECHANICAL: 0.5, K_CUSTOMER_SERVICE: 0.5,
                      K_MATHEMATICS: 0.3},
        "skills": {S_TIME_MANAGEMENT: 0.9, S_COORDINATION: 0.8,
                   S_OPERATIONS_ANALYSIS: 0.6, S_JUDGEMENT_DECISION: 0.5,
                   S_QUALITY_CONTROL: 0.5},
        "work_activities": {W_ORGANIZING_PLANNING: 1.0,
                            W_COORDINATING_OTHERS: 0.7,
                            W_DOCUMENTING_RECORDING: 0.5,
                            W_COMMUNICATING_INTERNAL: 0.5,
                            W_DECISIONS_PROBLEMS: 0.4},
        "abilities": {A_INFORMATION_ORDERING: 0.8, A_PERCEPTUAL_SPEED: 0.5,
                      A_SELECTIVE_ATTENTION: 0.5, A_PROBLEM_SENSITIVITY: 0.4},
        "work_styles": {WS_DEPENDABILITY: 1.0, WS_ATTENTION_TO_DETAIL: 0.7,
                        WS_STRESS_TOLERANCE: 0.6, WS_COOPERATION: 0.5},
    },
    "government": {
        "interests": {RIASEC_ELEMENTS["conventional"]: 0.8,
                      RIASEC_ELEMENTS["social"]: 0.7,
                      RIASEC_ELEMENTS["enterprising"]: 0.5},
        "knowledge": {K_LAW_GOVERNMENT: 1.0, K_ADMIN_MANAGEMENT: 0.6,
                      K_CUSTOMER_SERVICE: 0.5, K_SOCIOLOGY: 0.4,
                      K_ENGLISH: 0.4},
        "skills": {S_SERVICE_ORIENTATION: 0.7, S_CRITICAL_THINKING: 0.6,
                   S_SPEAKING: 0.6, S_COORDINATION: 0.5,
                   S_JUDGEMENT_DECISION: 0.5, S_WRITING: 0.5},
        "work_activities": {W_WORKING_WITH_PUBLIC: 0.9,
                            W_ADMINISTRATIVE_ACTIVITIES: 0.7,
                            W_DOCUMENTING_RECORDING: 0.6,
                            W_COMMUNICATING_EXTERNAL: 0.5,
                            W_DECISIONS_PROBLEMS: 0.4},
        "abilities": {A_ORAL_EXPRESSION: 0.7, A_WRITTEN_COMPREHENSION: 0.6,
                      A_PROBLEM_SENSITIVITY: 0.5, A_INFORMATION_ORDERING: 0.5},
        "work_styles": {WS_INTEGRITY: 1.0, WS_DEPENDABILITY: 0.8,
                        WS_SELF_CONTROL: 0.6, WS_COOPERATION: 0.5},
    },
    "marketing": {
        "interests": {RIASEC_ELEMENTS["enterprising"]: 1.0,
                      RIASEC_ELEMENTS["artistic"]: 0.6,
                      RIASEC_ELEMENTS["social"]: 0.4},
        "knowledge": {K_SALES_MARKETING: 1.0, K_COMMUNICATIONS_MEDIA: 0.8,
                      K_ENGLISH: 0.6, K_CUSTOMER_SERVICE: 0.5,
                      K_ADMIN_MANAGEMENT: 0.3},
        "skills": {S_PERSUASION: 0.9, S_SPEAKING: 0.8, S_WRITING: 0.7,
                   S_SOCIAL_PERCEPTIVENESS: 0.6, S_NEGOTIATION: 0.5,
                   S_TIME_MANAGEMENT: 0.4},
        "work_activities": {W_SELLING_INFLUENCING: 0.9,
                            W_COMMUNICATING_EXTERNAL: 0.8,
                            W_THINKING_CREATIVELY: 0.6,
                            W_BUILDING_RELATIONSHIPS: 0.6,
                            W_DEVELOPING_OBJECTIVES: 0.4},
        "abilities": {A_ORAL_EXPRESSION: 0.8, A_FLUENCY_OF_IDEAS: 0.7,
                      A_WRITTEN_EXPRESSION: 0.6, A_ORIGINALITY: 0.5},
        "work_styles": {WS_INITIATIVE: 0.8, WS_ADAPTABILITY: 0.7,
                        WS_SOCIAL_ORIENTATION: 0.7, WS_ACHIEVEMENT: 0.6},
    },
    "sports": {
        "interests": {RIASEC_ELEMENTS["realistic"]: 0.9,
                      RIASEC_ELEMENTS["social"]: 0.8,
                      RIASEC_ELEMENTS["enterprising"]: 0.4},
        "knowledge": {K_THERAPY: 0.7, K_EDUCATION_TRAINING: 0.7,
                      K_PSYCHOLOGY: 0.5, K_BIOLOGY: 0.5,
                      K_CUSTOMER_SERVICE: 0.4},
        "skills": {S_INSTRUCTING: 0.9, S_SERVICE_ORIENTATION: 0.7,
                   S_SOCIAL_PERCEPTIVENESS: 0.6, S_COORDINATION: 0.6,
                   S_TIME_MANAGEMENT: 0.4},
        "work_activities": {W_TRAINING_TEACHING: 0.9, W_ASSISTING_CARING: 0.7,
                            W_WORKING_WITH_PUBLIC: 0.6,
                            W_GUIDING_DIRECTING: 0.5,
                            W_DEVELOPING_TEAMS: 0.5},
        "abilities": {A_ORAL_EXPRESSION: 0.7, A_PROBLEM_SENSITIVITY: 0.5,
                      A_MANUAL_DEXTERITY: 0.4, A_SELECTIVE_ATTENTION: 0.4},
        "work_styles": {WS_SOCIAL_ORIENTATION: 0.8, WS_INITIATIVE: 0.7,
                        WS_ADAPTABILITY: 0.6, WS_CONCERN_FOR_OTHERS: 0.6},
    },
}

DOMAIN_KEYS: List[str] = list(DOMAIN_PROFILES.keys())

DOMAIN_LABELS: Dict[str, str] = {
    "tech": "Technology & Computing",
    "data": "Data & Analytics",
    "design": "Design & UX",
    "business": "Business Strategy",
    "creative": "Creative Media",
    "science": "Science & Research",
    "health": "Health & Medicine",
    "engineering": "Engineering & Manufacturing",
    "finance": "Finance & Economics",
    "law": "Law & Policy",
    "education": "Education & Learning",
    "arts": "Arts & Culture",
    "social": "Social Sciences & Humanities",
    "environment": "Environment & Sustainability",
    "architecture": "Architecture & Construction",
    "energy": "Energy & Infrastructure",
    "logistics": "Transportation & Logistics",
    "government": "Government & Public Services",
    "marketing": "Marketing & Communications",
    "sports": "Sports, Fitness & Recreation",
}


# ---------------------------------------------------------------------------
# SOC families (§15, §16)
# ---------------------------------------------------------------------------
# Prefixes are validated against occupation_data at cache build time; an unknown
# prefix logs a warning and is dropped rather than silently filtering everything
# out. Note that Web and Digital Interface Designers (15-1255) live in the
# computing family, which is exactly why design must not be reduced to "27-".

DOMAIN_SOC_PREFIXES: Dict[str, List[str]] = {
    "tech": ["15-12", "15-11", "17-20", "11-30"],
    "data": ["15-20", "15-25", "13-20", "15-12", "19-30"],
    "design": ["27-102", "15-1255", "27-101", "17-10"],
    "business": ["13-", "11-", "41-30"],
    "creative": ["27-", "13-1161"],
    "science": ["19-1", "19-2", "19-4", "19-30"],
    "health": ["29-", "31-"],
    "engineering": ["17-2", "17-3", "51-"],
    "finance": ["13-2", "11-3031", "43-3"],
    "law": ["23-"],
    "education": ["25-"],
    "arts": ["27-1", "27-20", "25-4"],
    "social": ["19-3", "21-1", "25-1"],
    "environment": ["19-2041", "19-4042", "17-2081", "11-9121", "19-1"],
    "architecture": ["17-1", "47-1", "47-2"],
    "energy": ["47-21", "49-", "51-8", "17-2071", "17-2171"],
    "logistics": ["53-", "43-5", "13-1081"],
    "government": ["33-", "43-4", "11-916", "13-1041"],
    "marketing": ["11-2", "13-1161", "27-30"],
    "sports": ["27-2", "39-90", "29-112", "31-901"],
}

# Occupations in these families are plausible cross-domain results for any
# technology-flavoured profile and are never hard-excluded when tech/data/design
# are combined.
CROSS_DOMAIN_BRIDGE_PREFIXES: List[str] = ["15-1255", "15-1254", "27-1021",
                                           "27-1024", "15-1252", "15-2051"]


# ---------------------------------------------------------------------------
# Academic / professional background (§8, §26)
# ---------------------------------------------------------------------------
# A compatibility signal, never a filter. Each background is a weighted element
# profile in exactly the same shape as a domain profile.

BACKGROUND_PROFILES: Dict[str, Dict[str, Dict[str, float]]] = {
    "cs": {
        "knowledge": {K_COMPUTERS_ELECTRONICS: 1.0, K_ENGINEERING_TECH: 0.5,
                      K_MATHEMATICS: 0.5},
        "skills": {S_PROGRAMMING: 1.0, S_SYSTEMS_ANALYSIS: 0.6,
                   S_COMPLEX_PROBLEM_SOLVING: 0.5},
        "work_activities": {W_WORKING_WITH_COMPUTERS: 0.8},
    },
    "math": {
        "knowledge": {K_MATHEMATICS: 1.0, K_PHYSICS: 0.3},
        "skills": {S_MATHEMATICS: 1.0, S_CRITICAL_THINKING: 0.5,
                   S_SCIENCE: 0.3},
        "abilities": {A_MATHEMATICAL_REASONING: 0.9, A_NUMBER_FACILITY: 0.7},
        "work_activities": {W_ANALYZING_DATA: 0.8},
    },
    "art": {
        "knowledge": {K_DESIGN: 1.0, K_FINE_ARTS: 0.9,
                      K_COMMUNICATIONS_MEDIA: 0.4},
        "abilities": {A_ORIGINALITY: 0.8, A_VISUALIZATION: 0.7,
                      A_FLUENCY_OF_IDEAS: 0.6},
        "work_activities": {W_THINKING_CREATIVELY: 0.9,
                            W_DRAFTING_SPECIFYING: 0.4},
    },
    "business": {
        "knowledge": {K_ADMIN_MANAGEMENT: 1.0, K_ECONOMICS_ACCOUNTING: 0.9,
                      K_SALES_MARKETING: 0.5, K_HR: 0.3},
        "skills": {S_JUDGEMENT_DECISION: 0.7, S_MANAGE_FINANCIAL: 0.7,
                   S_NEGOTIATION: 0.4},
        "work_activities": {W_DEVELOPING_OBJECTIVES: 0.7,
                            W_ORGANIZING_PLANNING: 0.5},
    },
    "engineering": {
        "knowledge": {K_ENGINEERING_TECH: 1.0, K_PHYSICS: 0.7,
                      K_MATHEMATICS: 0.7, K_MECHANICAL: 0.5, K_DESIGN: 0.3},
        "skills": {S_OPERATIONS_ANALYSIS: 0.7, S_TROUBLESHOOTING: 0.5,
                   S_MATHEMATICS: 0.5},
        "abilities": {A_VISUALIZATION: 0.5, A_MATHEMATICAL_REASONING: 0.6},
    },
    "health": {
        "knowledge": {K_MEDICINE: 1.0, K_BIOLOGY: 0.8, K_THERAPY: 0.6,
                      K_CHEMISTRY: 0.5, K_PSYCHOLOGY: 0.4},
        "skills": {S_SERVICE_ORIENTATION: 0.6, S_SOCIAL_PERCEPTIVENESS: 0.5,
                   S_SCIENCE: 0.6},
        "work_activities": {W_ASSISTING_CARING: 0.8},
    },
}

BACKGROUND_LABELS: Dict[str, str] = {
    "cs": "Computer Science / IT",
    "math": "Mathematics / Statistics",
    "art": "Arts & Design",
    "business": "Business / Economics",
    "engineering": "Engineering",
    "health": "Health Sciences",
}


# ---------------------------------------------------------------------------
# School subjects (optional, South African NSC subject list)
# ---------------------------------------------------------------------------
# Subjects are a weaker signal than a completed qualification, so they are
# folded into the academic-background vector at SCHOOL_SUBJECT_WEIGHT strength.

SCHOOL_SUBJECT_WEIGHT: float = 0.5

SCHOOL_SUBJECT_PROFILES: Dict[str, Dict[str, Dict[str, float]]] = {
    "mathematics": {
        "knowledge": {K_MATHEMATICS: 1.0},
        "skills": {S_MATHEMATICS: 0.9, S_CRITICAL_THINKING: 0.4},
        "abilities": {A_MATHEMATICAL_REASONING: 0.8, A_NUMBER_FACILITY: 0.6},
    },
    "maths_literacy": {
        "knowledge": {K_MATHEMATICS: 0.3},
        "skills": {S_MATHEMATICS: 0.3},
    },
    "physical_sciences": {
        "knowledge": {K_PHYSICS: 1.0, K_CHEMISTRY: 0.8, K_MATHEMATICS: 0.4},
        "skills": {S_SCIENCE: 0.8},
    },
    "life_sciences": {
        "knowledge": {K_BIOLOGY: 1.0, K_CHEMISTRY: 0.3},
        "skills": {S_SCIENCE: 0.6},
    },
    "information_technology": {
        "knowledge": {K_COMPUTERS_ELECTRONICS: 1.0},
        "skills": {S_PROGRAMMING: 0.9, S_COMPLEX_PROBLEM_SOLVING: 0.4},
        "work_activities": {W_WORKING_WITH_COMPUTERS: 0.7},
    },
    "cat": {  # Computer Applications Technology
        "knowledge": {K_COMPUTERS_ELECTRONICS: 0.6, K_ADMINISTRATIVE: 0.3},
        "work_activities": {W_WORKING_WITH_COMPUTERS: 0.6,
                            W_DOCUMENTING_RECORDING: 0.3},
    },
    "accounting": {
        "knowledge": {K_ECONOMICS_ACCOUNTING: 1.0, K_MATHEMATICS: 0.4},
        "skills": {S_MANAGE_FINANCIAL: 0.7},
        "work_styles": {WS_ATTENTION_TO_DETAIL: 0.5},
    },
    "business_studies": {
        "knowledge": {K_ADMIN_MANAGEMENT: 0.9, K_SALES_MARKETING: 0.5},
        "skills": {S_JUDGEMENT_DECISION: 0.4},
    },
    "economics": {
        "knowledge": {K_ECONOMICS_ACCOUNTING: 0.9, K_MATHEMATICS: 0.3},
        "work_activities": {W_ANALYZING_DATA: 0.5},
    },
    "visual_arts": {
        "knowledge": {K_FINE_ARTS: 1.0, K_DESIGN: 0.6},
        "abilities": {A_ORIGINALITY: 0.7, A_VISUALIZATION: 0.6},
        "work_activities": {W_THINKING_CREATIVELY: 0.8},
    },
    "design": {
        "knowledge": {K_DESIGN: 1.0, K_FINE_ARTS: 0.5},
        "abilities": {A_ORIGINALITY: 0.6, A_VISUALIZATION: 0.7},
        "work_activities": {W_THINKING_CREATIVELY: 0.7,
                            W_DRAFTING_SPECIFYING: 0.5},
    },
    "egd": {  # Engineering Graphics and Design
        "knowledge": {K_DESIGN: 0.7, K_ENGINEERING_TECH: 0.7,
                      K_MECHANICAL: 0.4},
        "abilities": {A_VISUALIZATION: 0.9},
        "work_activities": {W_DRAFTING_SPECIFYING: 0.8},
    },
    "geography": {
        "knowledge": {K_GEOGRAPHY: 1.0},
        "work_activities": {W_ANALYZING_DATA: 0.3},
    },
    "history": {
        "knowledge": {K_HISTORY: 1.0, K_ENGLISH: 0.3},
        "skills": {S_WRITING: 0.4, S_READING: 0.4},
    },
    "languages": {
        "knowledge": {K_ENGLISH: 0.9},
        "skills": {S_WRITING: 0.6, S_SPEAKING: 0.5, S_READING: 0.5},
        "abilities": {A_WRITTEN_EXPRESSION: 0.6, A_ORAL_EXPRESSION: 0.5},
    },
    "dramatic_arts": {
        "knowledge": {K_FINE_ARTS: 0.7, K_COMMUNICATIONS_MEDIA: 0.5},
        "abilities": {A_ORAL_EXPRESSION: 0.7, A_ORIGINALITY: 0.5},
        "work_activities": {W_WORKING_WITH_PUBLIC: 0.5},
    },
    "music": {
        "knowledge": {K_FINE_ARTS: 0.9},
        "abilities": {A_ORIGINALITY: 0.6, A_MEMORIZATION: 0.4},
    },
    "consumer_studies": {
        "knowledge": {K_DESIGN: 0.3, K_CUSTOMER_SERVICE: 0.5},
    },
    "tourism": {
        "knowledge": {K_CUSTOMER_SERVICE: 0.8, K_GEOGRAPHY: 0.4},
        "work_activities": {W_WORKING_WITH_PUBLIC: 0.6},
    },
}

SCHOOL_SUBJECT_LABELS: Dict[str, str] = {
    "mathematics": "Mathematics",
    "maths_literacy": "Mathematical Literacy",
    "physical_sciences": "Physical Sciences",
    "life_sciences": "Life Sciences",
    "information_technology": "Information Technology (IT)",
    "cat": "Computer Applications Technology",
    "accounting": "Accounting",
    "business_studies": "Business Studies",
    "economics": "Economics",
    "visual_arts": "Visual Arts",
    "design": "Design",
    "egd": "Engineering Graphics & Design",
    "geography": "Geography",
    "history": "History",
    "languages": "Languages",
    "dramatic_arts": "Dramatic Arts",
    "music": "Music",
    "consumer_studies": "Consumer Studies",
    "tourism": "Tourism",
}


# ---------------------------------------------------------------------------
# Technology keyword families (§20)
# ---------------------------------------------------------------------------
# Used to describe what an occupation's technology_skills rows are *about*, so
# that technology alignment compares the user's tooling interests against the
# occupation's real stack. Matching is substring, case-insensitive, on
# technology_skills.example.

TECH_KEYWORDS_BY_DOMAIN: Dict[str, List[str]] = {
    "tech": ["python", "java", "javascript", "c++", "c#", "git", "linux",
             "docker", "kubernetes", "api", "web platform",
             "development environment", "compiler", "node", "php", "ruby",
             ".net", "android", "ios", "cloud", "aws", "azure"],
    "data": ["sql", "tableau", "power bi", "sas", "spss", "stata", "r ",
             "matlab", "hadoop", "spark", "analytical or scientific",
             "data base", "database", "excel", "olap", "etl", "qlik"],
    "design": ["adobe photoshop", "adobe illustrator", "adobe indesign",
               "figma", "sketch", "adobe xd", "graphics software",
               "autodesk", "coreldraw", "blender", "cad", "wireframe",
               "invision", "axure"],
    "business": ["sap", "oracle", "microsoft excel", "microsoft project",
                 "salesforce", "quickbooks", "erp", "customer relationship",
                 "sharepoint", "microsoft powerpoint", "peoplesoft"],
    "creative": ["adobe premiere", "after effects", "final cut", "avid",
                 "audacity", "pro tools", "wordpress", "content management",
                 "video creation", "desktop publishing", "canva"],
}


# ---------------------------------------------------------------------------
# Personality dimensions (§9)
# ---------------------------------------------------------------------------
# Deep-scan answers write into RIASEC plus these two work-style elements, so
# "personality" is measured against real O*NET data rather than invented.

PERSONALITY_DIMENSIONS: Dict[str, Dict[str, str]] = {
    "realistic": {"table": "interests", "element": RIASEC_ELEMENTS["realistic"]},
    "investigative": {"table": "interests", "element": RIASEC_ELEMENTS["investigative"]},
    "artistic": {"table": "interests", "element": RIASEC_ELEMENTS["artistic"]},
    "social": {"table": "interests", "element": RIASEC_ELEMENTS["social"]},
    "enterprising": {"table": "interests", "element": RIASEC_ELEMENTS["enterprising"]},
    "conventional": {"table": "interests", "element": RIASEC_ELEMENTS["conventional"]},
    "independence": {"table": "work_styles", "element": WS_INDEPENDENCE},
    "leadership": {"table": "work_styles", "element": WS_LEADERSHIP},
}


def all_mapped_element_ids() -> List[str]:
    """Every element ID referenced by any mapping - used for startup validation."""
    ids = set(RIASEC_ELEMENTS.values())
    for group in (DOMAIN_PROFILES, BACKGROUND_PROFILES, SCHOOL_SUBJECT_PROFILES):
        for profile in group.values():
            for table_map in profile.values():
                ids.update(table_map.keys())
    for spec in PERSONALITY_DIMENSIONS.values():
        ids.add(spec["element"])
    # Every named element constant counts as mapped, even when no domain
    # prototype uses it yet: the question bank writes to these directly, and an
    # unregistered id would be silently dropped by the profile builder.
    for name, value in globals().items():
        if name[:2] in ("K_", "S_", "A_", "W_") and isinstance(value, str):
            ids.add(value)
        elif name.startswith("WS_") and isinstance(value, str):
            ids.add(value)
    return sorted(ids)
