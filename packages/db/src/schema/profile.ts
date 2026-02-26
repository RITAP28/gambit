import { integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./user";
import { relations } from "drizzle-orm";

export const profiles = pgTable("profiles", {
    // IDs
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").unique().references(() => users.id, { onDelete: 'cascade' }),

    // metadata
    fullName: varchar("full_name", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    gamesPlayed: integer("games_played").default(0).notNull(),
    wins: integer("wins").default(0).notNull(),
    losses: integer("losses").default(0).notNull(),
    draws: integer("draws").default(0).notNull(),
    winStreak: integer("win_streak").default(0).notNull(),
    bestRating: integer("best_rating").default(0).notNull(),

    // timestamps
    updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// one-to-one relationship between profile and user
export const profileRelationWithUser = relations(profiles, ({ one }) => ({
    user: one(users, {
        fields: [profiles.userId],
        references: [users.id]
    })
}));