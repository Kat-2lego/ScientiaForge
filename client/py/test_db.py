import pyodbc

# TRY THIS: Change the server name below to match what you see in SSMS
conn_str = (
    r'DRIVER={ODBC Driver 17 for SQL Server};'
    r'SERVER=pc;' # <--- CHECK THIS
    r'DATABASE=SkillForgeCareer_DB;'
    r'Trusted_Connection=yes;'
)

try:
    conn = pyodbc.connect(conn_str)
    print("✅ SUCCESS: Connected to the database!")
    cursor = conn.cursor()
    cursor.execute("SELECT TOP 1 title FROM occupation_data")
    row = cursor.fetchone()
    print(f"✅ DATA CHECK: Found occupation: {row[0]}")
    conn.close()
except Exception as e:
    print("❌ ERROR: Connection failed!")
    print(f"Error Details: {e}")