import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./user";
import { tournaments } from "./tournament";
import { relations } from "drizzle-orm";
import { timeControlEnum, gameStatusEnum, terminationEnum, gameResultEnum } from "./enums";
import { chatMessages } from "./chat";

export const games = pgTable("games", {
    // IDs related to the game
    id: uuid("id").defaultRandom().primaryKey(),
    whitePlayerId: uuid("white_player_id")
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    blackPlayerId: uuid("black_player_id")
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),

    // metadata
    timeControl: timeControlEnum().notNull(),
    timeLimitSecs: integer("time_limit_secs").notNull(),
    incrementSecs: integer("increment_secs").default(0),
    status: gameStatusEnum().notNull(),
    result: gameResultEnum(),
    winner: uuid("winner_id").references(() => users.id, { onDelete: 'cascade' }),
    termination: terminationEnum(),
    initialFen: text("initial_fen"),
    currentFen: text("current_fen"),
    pgn: text("pgn"),
    whiteTimeLeft: integer("white_time_left"),
    blackTimeLeft: integer("black_time_left"),
    isRated: boolean("is_rated").default(true),
    resignedBy: uuid('resigned_by'),

    // if the game was from a tournament
    tournamentId: uuid("tournament_id").references(() => tournaments.id),

    // timestamps
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow().notNull()
});

export const gamesRelationWithUser = relations(games, ({ one, many }) => ({
    whitePlayer: one(users, {
        fields: [games.whitePlayerId],
        references: [users.id],
        relationName: "white_player"
    }),
    blackPlayer: one(users, {
        fields: [games.blackPlayerId],
        references: [users.id],
        relationName: "black_player"
    }),
    tournament: one(tournaments, {
        fields: [games.tournamentId],
        references: [tournaments.id]
    }),
    winner: one(users, {
        fields: [games.winner],
        references: [users.id]
    }),
    chats: many(chatMessages)
}))