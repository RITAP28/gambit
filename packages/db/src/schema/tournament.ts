import { pgTable, uuid } from "drizzle-orm/pg-core";

export const tournaments = pgTable("tournaments", {
    id: uuid("id").defaultRandom().primaryKey()
})