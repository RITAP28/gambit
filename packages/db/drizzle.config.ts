import { config } from 'dotenv'
import { resolve } from 'node:path'
import type { Config } from 'drizzle-kit'

// The .env lives at the repo root, not in this package. Plain `dotenv/config`
// resolves relative to the working directory, so running any drizzle-kit
// command from here found no DATABASE_URL.
config({ path: resolve(__dirname, '../../.env') })

const db_url = process.env.DATABASE_URL;

if (!db_url) {
    throw new Error('[db] DATABASE_URL is not set; cannot run drizzle-kit')
}

export default {
    out: "./drizzle",
    schema: "./src/schema",
    dialect: "postgresql",
    dbCredentials: {
        url: db_url
    }
} satisfies Config
