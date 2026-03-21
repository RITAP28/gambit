import 'dotenv/config'
import type { Config } from 'drizzle-kit'

const db_url = process.env.DATABASE_URL;

console.log('database url: ', db_url);
export default {
    out: "./drizzle",
    schema: "./src/schema",
    dialect: "postgresql",
    dbCredentials: {
        url: db_url!
    }
} satisfies Config