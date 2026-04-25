import postgres from 'postgres';
import 'dotenv/config'

const connectionString = process.env.CONNECTION_STRING;
const sql = postgres(connectionString);

export default sql;