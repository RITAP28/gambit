import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import * as schema from "./schema"
import 'dotenv/config'

const db_url = process.env.DATABASE_URL;
const sql = neon(db_url!)

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