import pyodbc
import pandas as pd
from sqlalchemy import create_engine
from datetime import datetime
import logging
import os
import urllib 
from sqlalchemy import create_engine

# =========================================================
# SKILLSFORGE O*NET ETL PIPELINE
# =========================================================
# PURPOSE:
# - Extract O*NET tables
# - Clean noisy records
# - Reduce database size
# - Preserve important intelligence
# - Build AI-ready career dataset
# - Improve recommendation quality
# - Improve performance
# =========================================================

# =========================================================
# CONFIGURATION
# =========================================================


MSSQL_CONN_STR = (
    r"DRIVER={ODBC Driver 18 for SQL Server};"
    r"SERVER=pc;"
    r"DATABASE=SkillForgeCareer_DB;"
    r"Trusted_Connection=yes;"
    r"TrustServerCertificate=yes;"
)




# FINAL CLEAN DATABASE
FINAL_DATABASE = 'SkillsForge_ETL'

# Minimum importance thresholds
MIN_IMPORTANCE = 3.0
MIN_WORK_STYLE = 3.5
MIN_WORK_ACTIVITY = 3.5
MIN_INTEREST = 2.5

# Generic features that appear too often
GENERIC_FEATURES = [
    'Active Listening',
    'Speaking',
    'Reading Comprehension',
    'Writing',
    'Critical Thinking'
]

# =========================================================
# LOGGING
# =========================================================

if not os.path.exists('logs'):
    os.makedirs('logs')

logging.basicConfig(
    filename='logs/etl_pipeline.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

logging.info('ETL PIPELINE STARTED')

# =========================================================
# DATABASE CONNECTION
# =========================================================
params = urllib.parse.quote_plus(MSSQL_CONN_STR)

engine = create_engine(
    f"mssql+pyodbc:///?odbc_connect={params}"
)

# =========================================================
# HELPER FUNCTIONS
# =========================================================

def log_table_size(table_name, before, after):
    reduction = before - after

    if before > 0:
        percent = round((reduction / before) * 100, 2)
    else:
        percent = 0

    print(f"{table_name}")
    print(f"Before: {before}")
    print(f"After : {after}")
    print(f"Reduced: {reduction} rows ({percent}%)")
    print('-' * 60)

    logging.info(
        f"{table_name} | Before={before} | After={after} | Reduction={percent}%"
    )


def read_table(table_name):
    print(f"Reading {table_name}...")
    return pd.read_sql(f"SELECT * FROM {table_name}", engine)


# =========================================================
# EXTRACT PHASE
# =========================================================

print('\n=========================================================')
print('EXTRACT PHASE')
print('=========================================================\n')

skills = read_table('skills')
abilities = read_table('abilities')
knowledge = read_table('knowledge')
work_activities = read_table('work_activities')
work_styles = read_table('work_styles')
interests = read_table('interests')
technology_skills = read_table('technology_skills')
occupation_data = read_table('occupation_data')
job_zones = read_table('job_zones')
related_occupations = read_table('related_occupations')

content_reference = pd.read_sql(
    "SELECT * FROM content_model_reference",
    engine
)

# =========================================================
# CREATE BACKUP SNAPSHOTS
# =========================================================

print('\n=========================================================')
print('CREATING BACKUPS')
print('=========================================================\n')

backup_time = datetime.now().strftime('%Y%m%d_%H%M%S')

backup_folder = f'backups/{backup_time}'
os.makedirs(backup_folder, exist_ok=True)

skills.to_csv(f'{backup_folder}/skills_backup.sql', index=False)
abilities.to_csv(f'{backup_folder}/abilities_backup.sql', index=False)
knowledge.to_csv(f'{backup_folder}/knowledge_backup.sql', index=False)

print('Backups created successfully.')

# =========================================================
# TRANSFORM PHASE
# =========================================================

print('\n=========================================================')
print('TRANSFORM PHASE')
print('=========================================================\n')

# =========================================================
# CLEAN TEXT FUNCTION
# =========================================================

def clean_text(df):
    for column in df.columns:
        if df[column].dtype == 'object':
            df[column] = (
                df[column]
                .astype(str)
                .str.strip()
                .str.replace('\n', ' ', regex=False)
                .str.replace('\r', ' ', regex=False)
            )

    return df


# =========================================================
# REMOVE DUPLICATES
# =========================================================

def remove_duplicates(df, table_name):
    before = len(df)
    df = df.drop_duplicates()
    after = len(df)

    log_table_size(f'{table_name} - DUPLICATES REMOVED', before, after)

    return df


# =========================================================
# MAIN FILTER FUNCTION
# =========================================================

def filter_importance_table(
    df,
    table_name,
    scale_id,
    min_score
):

    before = len(df)

    # Keep only desired scale
    df = df[df['scale_id'] == scale_id]

    # Keep strong records only
    df = df[df['data_value'] >= min_score]

    # Remove suppressed records
    if 'recommend_suppress' in df.columns:
        df = df[
            (df['recommend_suppress'].isna()) |
            (df['recommend_suppress'] != 'Y')
        ]

    # Remove irrelevant records
    if 'not_relevant' in df.columns:
        df = df[
            (df['not_relevant'].isna()) |
            (df['not_relevant'] != 'Y')
        ]

    # Remove NULL occupations
    df = df[df['onetsoc_code'].notna()]

    # Remove NULL element IDs
    df = df[df['element_id'].notna()]

    after = len(df)

    log_table_size(table_name, before, after)

    return df


# =========================================================
# CLEAN TABLES
# =========================================================

skills = clean_text(skills)
abilities = clean_text(abilities)
knowledge = clean_text(knowledge)
work_activities = clean_text(work_activities)
work_styles = clean_text(work_styles)
interests = clean_text(interests)
technology_skills = clean_text(technology_skills)
occupation_data = clean_text(occupation_data)

# =========================================================
# REMOVE DUPLICATES
# =========================================================

skills = remove_duplicates(skills, 'skills')
abilities = remove_duplicates(abilities, 'abilities')
knowledge = remove_duplicates(knowledge, 'knowledge')
work_activities = remove_duplicates(work_activities, 'work_activities')
work_styles = remove_duplicates(work_styles, 'work_styles')
interests = remove_duplicates(interests, 'interests')

# =========================================================
# FILTER IMPORTANT RECORDS
# =========================================================

skills = filter_importance_table(
    skills,
    'skills',
    'IM',
    MIN_IMPORTANCE
)

abilities = filter_importance_table(
    abilities,
    'abilities',
    'IM',
    MIN_IMPORTANCE
)

knowledge = filter_importance_table(
    knowledge,
    'knowledge',
    'IM',
    MIN_IMPORTANCE
)

work_activities = filter_importance_table(
    work_activities,
    'work_activities',
    'IM',
    MIN_WORK_ACTIVITY
)

work_styles = filter_importance_table(
    work_styles,
    'work_styles',
    'IW',
    MIN_WORK_STYLE
)

interests = filter_importance_table(
    interests,
    'interests',
    'OI',
    MIN_INTEREST
)

# =========================================================
# TECHNOLOGY SKILLS CLEANING
# =========================================================

print('\n=========================================================')
print('CLEANING TECHNOLOGY SKILLS')
print('=========================================================\n')

before = len(technology_skills)

# Keep only hot or in-demand technologies
if 'hot_technology' in technology_skills.columns and 'in_demand' in technology_skills.columns:

    technology_skills = technology_skills[
        (technology_skills['hot_technology'] == 'Y') |
        (technology_skills['in_demand'] == 'Y')
    ]

# Remove generic tools
GENERIC_TECH = [
    'Microsoft Word',
    'Spreadsheet software',
    'Email software',
    'Microsoft Office',
    'Word processing software'
]

if 'example' in technology_skills.columns:
    technology_skills = technology_skills[
        ~technology_skills['example'].isin(GENERIC_TECH)
    ]

# Remove duplicates
technology_skills = technology_skills.drop_duplicates()

after = len(technology_skills)

log_table_size('technology_skills', before, after)

# =========================================================
# REMOVE OUTDATED OCCUPATIONS
# =========================================================

print('\n=========================================================')
print('REMOVING LOW VALUE OCCUPATIONS')
print('=========================================================\n')

before = len(occupation_data)

active_occupations = set(skills['onetsoc_code'])
active_occupations.update(technology_skills['onetsoc_code'])
active_occupations.update(knowledge['onetsoc_code'])

occupation_data = occupation_data[
    occupation_data['onetsoc_code'].isin(active_occupations)
]

after = len(occupation_data)

log_table_size('occupation_data', before, after)

# =========================================================
# FEATURE ENGINEERING
# =========================================================

print('\n=========================================================')
print('FEATURE ENGINEERING')
print('=========================================================\n')

# =========================================================
# CREATE ELEMENT LOOKUP
# =========================================================

content_lookup = content_reference[[
    'element_id',
    'element_name'
]].drop_duplicates()

occupation_lookup = occupation_data[[
    'onetsoc_code',
    'title'
]].drop_duplicates()

# =========================================================
# BUILD FEATURE TABLE FUNCTION
# =========================================================

def build_feature_table(df, feature_type):

    merged = df.merge(
        occupation_lookup,
        on='onetsoc_code',
        how='left'
    )

    merged = merged.merge(
        content_lookup,
        on='element_id',
        how='left'
    )

    final = pd.DataFrame({
        'onetsoc_code': merged['onetsoc_code'],
        'occupation_title': merged['title'],
        'feature_name': merged['element_name'],
        'feature_type': feature_type,
        'importance_score': merged['data_value']
    })

    return final


# =========================================================
# BUILD UNIFIED CAREER FEATURES TABLE
# =========================================================

career_skills = build_feature_table(skills, 'Skill')
career_abilities = build_feature_table(abilities, 'Ability')
career_knowledge = build_feature_table(knowledge, 'Knowledge')
career_work_styles = build_feature_table(work_styles, 'Work Style')
career_work_activities = build_feature_table(work_activities, 'Work Activity')
career_interests = build_feature_table(interests, 'Interest')

career_features = pd.concat([
    career_skills,
    career_abilities,
    career_knowledge,
    career_work_styles,
    career_work_activities,
    career_interests
], ignore_index=True)

# =========================================================
# REMOVE GENERIC FEATURES
# =========================================================

before = len(career_features)

career_features = career_features[
    ~career_features['feature_name'].isin(GENERIC_FEATURES)
]

after = len(career_features)

log_table_size('career_features generic reduction', before, after)

# =========================================================
# CREATE FEATURE WEIGHTS
# =========================================================

WEIGHTS = {
    'Skill': 1.0,
    'Ability': 0.9,
    'Knowledge': 0.8,
    'Work Style': 0.6,
    'Work Activity': 0.7,
    'Interest': 0.5
}

career_features['feature_weight'] = career_features[
    'feature_type'
].map(WEIGHTS)

career_features['weighted_score'] = (
    career_features['importance_score'] *
    career_features['feature_weight']
)

# =========================================================
# CREATE TECHNOLOGY STACK TABLE
# =========================================================

print('\n=========================================================')
print('CREATING TECHNOLOGY STACK')
print('=========================================================\n')

career_technology_stack = technology_skills.copy()

if 'example' in career_technology_stack.columns:

    career_technology_stack = career_technology_stack.merge(
        occupation_lookup,
        on='onetsoc_code',
        how='left'
    )

    career_technology_stack = career_technology_stack[[
        'onetsoc_code',
        'title',
        'example'
    ]]

    career_technology_stack.columns = [
        'onetsoc_code',
        'occupation_title',
        'technology'
    ]

# =========================================================
# CREATE CAREER SIMILARITY DATASET
# =========================================================

print('\n=========================================================')
print('CREATING CAREER SIMILARITY ENGINE')
print('=========================================================\n')

career_similarity = career_features[[
    'onetsoc_code',
    'feature_name',
    'weighted_score'
]]

# =========================================================
# LOAD PHASE
# =========================================================

print('\n=========================================================')
print('LOAD PHASE')
print('=========================================================\n')

# =========================================================
# SAVE CLEAN CSV FILES
# =========================================================

output_folder = 'final_etl_output'
os.makedirs(output_folder, exist_ok=True)

skills.to_csv(f'{output_folder}/clean_skills.sql', index=False)
abilities.to_csv(f'{output_folder}/clean_abilities.sql', index=False)
knowledge.to_csv(f'{output_folder}/clean_knowledge.sql', index=False)
work_activities.to_csv(f'{output_folder}/clean_work_activities.sql', index=False)
work_styles.to_csv(f'{output_folder}/clean_work_styles.sql', index=False)
interests.to_csv(f'{output_folder}/clean_interests.sql', index=False)
technology_skills.to_csv(f'{output_folder}/clean_technology_skills.sql', index=False)
occupation_data.to_csv(f'{output_folder}/clean_occupation_data.sql', index=False)
career_features.to_csv(f'{output_folder}/career_features..sql', index=False)
career_technology_stack.to_csv(f'{output_folder}/career_technology_stack.sql', index=False)
career_similarity.to_csv(f'{output_folder}/career_similarity.sql', index=False)

print('SQL exports completed.')

# =========================================================
# SAVE TO SQL SERVER
# =========================================================

print('\n=========================================================')
print('LOADING TO SQL SERVER')
print('=========================================================\n')

skills.to_sql(
    'career_skills',
    engine,
    if_exists='replace',
    index=False
)

abilities.to_sql(
    'career_abilities',
    engine,
    if_exists='replace',
    index=False
)

knowledge.to_sql(
    'career_knowledge',
    engine,
    if_exists='replace',
    index=False
)

work_activities.to_sql(
    'career_work_activities',
    engine,
    if_exists='replace',
    index=False
)

work_styles.to_sql(
    'career_work_styles',
    engine,
    if_exists='replace',
    index=False
)

interests.to_sql(
    'career_interests',
    engine,
    if_exists='replace',
    index=False
)

career_features.to_sql(
    'career_features',
    engine,
    if_exists='replace',
    index=False
)

career_technology_stack.to_sql(
    'career_technology_stack',
    engine,
    if_exists='replace',
    index=False
)

career_similarity.to_sql(
    'career_similarity',
    engine,
    if_exists='replace',
    index=False
)

print('SQL Server load complete.')

# =========================================================
# CREATE INDEXES
# =========================================================

print('\n=========================================================')
print('CREATING PERFORMANCE INDEXES')
print('=========================================================\n')

index_queries = [

    """
    CREATE INDEX idx_career_features_onet
    ON career_features(onetsoc_code)
    """,

    """
    CREATE INDEX idx_career_features_feature
    ON career_features(feature_name)
    """,

    """
    CREATE INDEX idx_technology_stack
    ON career_technology_stack(onetsoc_code)
    """
]

with engine.begin() as connection:

    for query in index_queries:

        try:
            connection.execute(query)
            print('Index created.')
        except Exception as e:
            print(f'Index already exists or failed: {e}')

# =========================================================
# PIPELINE ANALYTICS
# =========================================================

print('\n=========================================================')
print('FINAL ANALYTICS')
print('=========================================================\n')

print('Top Occupations by Feature Count')
print(
    career_features['occupation_title']
    .value_counts()
    .head(10)
)

print('\nTop Technologies')

if 'technology' in career_technology_stack.columns:

    print(
        career_technology_stack['technology']
        .value_counts()
        .head(20)
    )

print('\nTop Feature Types')
print(career_features['feature_type'].value_counts())

# =========================================================
# DATABASE SIZE REDUCTION ESTIMATION
# =========================================================

print('\n=========================================================')
print('DATABASE REDUCTION SUMMARY')
print('=========================================================\n')

original_total = (
    len(skills) +
    len(abilities) +
    len(knowledge) +
    len(work_activities) +
    len(work_styles) +
    len(interests)
)

clean_total = len(career_features)

print(f'Original Important Records: {original_total}')
print(f'Final Unified Records      : {clean_total}')

if original_total > 0:

    reduction_percent = round(
        ((original_total - clean_total) / original_total) * 100,
        2
    )

    print(f'Reduction Percentage       : {reduction_percent}%')

# =========================================================
# OPTIONAL ADVANCED AI EXPORTS
# =========================================================

print('\n=========================================================')
print('CREATING AI READY DATASETS')
print('=========================================================\n')

# Occupation embeddings dataset
occupation_vectors = career_features.pivot_table(
    index='occupation_title',
    columns='feature_name',
    values='weighted_score',
    fill_value=0
)

occupation_vectors.to_csv(
    f'{output_folder}/occupation_vectors.sql'
)

print('Occupation vector dataset created.')

# =========================================================
# FINAL MESSAGE
# =========================================================

print('\n=========================================================')
print('ETL PIPELINE COMPLETED SUCCESSFULLY')
print('=========================================================\n')

logging.info('ETL PIPELINE COMPLETED')

# =========================================================
# FUTURE AI FEATURES YOU CAN BUILD
# =========================================================
#
# - Career Recommendation Engine
# - Resume Matching
# - Career Similarity Search
# - Skill Gap Analysis
# - Internship Matching
# - Learning Path Recommendations
# - AI Chatbot Career Guidance
# - Technology Trend Detection
# - Career Clustering
# - Personalized User Scoring
#
# =========================================================
