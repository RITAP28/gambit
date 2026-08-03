import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import * as schema from "./schema"
import 'dotenv/config'

const db_url = process.env.DATABASE_URL;

if (!db_url) {
    throw new Error('[db] DATABASE_URL is not set');
}

// Only the host is logged. The connection string carries the password, and
// printing it wrote live credentials into every server log and CI transcript.
console.log('[db] connecting to', new URL(db_url).host);

const sql = neon(db_url)

export const db = drizzle(sql, { schema })

export async function testDatabaseConnection() {
    try {
        console.log('testing database connection...')
        await sql`SELECT 1 as test`;
        console.log("✅ Database connection successful")
        return true
    } catch (error) {
        console.error('database connection failed: ', error)
        return false
    }
}

export * from "./schema"
export { eq, ne, and, or, not, asc, desc, sql, inArray, gte, lte, isNull, count } from 'drizzle-orm'