import { relations } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { games } from "./game";
import { ratings } from "./rating";
import { matchMakingQueues } from "./matchmakingqueue";
import { sessions } from "./session";
import { profiles } from "./profile";

export const authProviderEnum = pgEnum("authProviderEnum", ["credentials", "google"]);
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),

    // metadata
    username: varchar("username", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password", { length: 255 }).unique().notNull(),
    authProvider: authProviderEnum().default("credentials").notNull(),
    bio: text('bio'),
    isAuthenticated: boolean("is_authenticated").default(false).notNull(),
    isOnline: boolean("is_online").default(false).notNull(),

    // timestamps
    lastSeenAt: timestamp("last_seen_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
    session: one(sessions, {
        fields: [users.id],
        references: [sessions.userId]
    }),
    gameAsWhite: many(games, {
        relationName: "white_player"
    }),
    gameAsBlack: many(games, {
        relationName: "black_player"
    }),
    userRating: one(ratings, {
        fields: [users.id],
        references: [ratings.userId]
    }),
    matchMakingQueue: one(matchMakingQueues, {
        fields: [users.id],
        references: [matchMakingQueues.userId]
    }),
    userProfile: one(profiles, {
        fields: [users.id],
        references: [profiles.userId]
    })
}));