import { boolean, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const authProviderEnum = pgEnum("authProviderEnum", ["credentials", "google"]);
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password", { length: 255 }).unique().notNull(),
    authProvider: authProviderEnum().default("credentials").notNull(),
    bio: text('bio'),
    
    isAuthenticated: boolean("is_authenticated").default(false).notNull(),
    isOnline: boolean("is_online").default(false).notNull(),

    lastSeenAt: timestamp("last_seen_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});