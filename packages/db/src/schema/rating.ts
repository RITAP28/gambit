import { doublePrecision, integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./user";
import { relations } from "drizzle-orm";
import { timeControlEnum } from "./enums";

/**
 * One row per (user, time control). Glicko-2 keeps three numbers per rating:
 * the rating itself, how uncertain we are about it (deviation), and how
 * erratic the player's results have been (volatility).
 *
 * Rating and deviation are floats rather than integers — rounding on every
 * game would compound drift over a career.
 */
export const ratings = pgTable("ratings", {
    // related IDs
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: 'cascade' })
        .notNull(),

    // metadata
    timeControl: timeControlEnum("time_control").notNull(),
    rating: doublePrecision("rating").notNull().default(1500),
    ratingDeviation: doublePrecision("rating_deviation").notNull().default(350),
    volatility: doublePrecision("volatility").notNull().default(0.06),
    gamesPlayed: integer("games_played")
        .notNull()
        .default(0),
    peakRating: doublePrecision("peak_rating").notNull().default(1500),

    // timestamps
    lastPlayedAt: timestamp("last_played_at"),
    updatedAt: timestamp("updated_at")
        .defaultNow()
        .notNull()
}, (table) => [
    unique("user_time_control_unique").on(table.userId,table.timeControl)
]);

// one-to-one relationship between ratings and user
export const ratingRelationWithUser = relations(ratings, ({ one }) => ({
    user: one(users, {
        fields: [ratings.userId],
        references: [users.id]
    })
}));
