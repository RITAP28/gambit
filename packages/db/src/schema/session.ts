import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./user";

export const sessions = pgTable("sessions", {
    id: uuid('session_id').defaultRandom().primaryKey(),
    userId: uuid('session_user_id').unique().references(() => users.id, { onDelete: "cascade" }),
    accessToken: varchar({ length: 255 }).unique(),
    refreshToken: varchar({ length: 255 }).unique(),
    expiresAt: timestamp('session_expires_at').notNull()
});

// one-to-one relationship between user and session
export const sessionRelationWithUser = relations(sessions, ({ one }) => ({
    user: one(users, {
        fields: [sessions.userId],
        references: [users.id]
    })
}));