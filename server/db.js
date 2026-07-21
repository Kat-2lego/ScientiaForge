import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.CONNECTION_STRING;

const sql = postgres(connectionString);

try {
  await sql`SELECT 1`;
  console.log("Database connected successfully");
} catch (err) {
  console.error("Database connection failed:", err.message);
}

export default sql;