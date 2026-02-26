import { boolean, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./user";
import { TimeControl } from "./game";
import { relations } from "drizzle-orm";

export const matchMakingQueues = pgTable("matchMakingQueues", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").unique().references(() => users.id, { onDelete: 'cascade' }).notNull(),
    timeControl: TimeControl().notNull(),
    timeLimit: integer("time_limit").notNull(),
    increment: integer("increment").default(0).notNull(),
    ratingMin: integer("rating_min").notNull(),
    ratingMax: integer("rating_max").notNull(),
    isRated: boolean("is_rated").default(true).notNull(),
    joinedAt: timestamp("joined_at").notNull()
});


// one-to-one relationship with user
export const matchMakingRelationWithUser = relations(matchMakingQueues, ({ one}) => ({
    user: one(users, {
        fields: [matchMakingQueues.userId],
        references: [users.id]
    })
}));