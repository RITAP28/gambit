import { integer, pgTable, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./user";
import { relations } from "drizzle-orm";
import { timeControlEnum } from "./enums";

export const ratings = pgTable("ratings", {
    // related IDs
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: 'cascade' })
        .notNull(),

    // metadata
    timeControl: timeControlEnum("time_control").notNull(),
    rating: integer("rating").default(1200),
    gamesPlayed: integer("games_played")
        .notNull()
        .default(0),

    // timestamps
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