import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./user";
import { tournaments } from "./tournament";
import { relations } from "drizzle-orm";

export const TimeControl = pgEnum("timeControlEnum", ["bullet", "blitz", "rapid", "classical", "daily"]);
export const GameStatus = pgEnum("gameStatusEnum", ["waiting", "in_progress", "completed", "abandoned", "aborted"]);
export const GameResult = pgEnum("gameResultEnum", ["white_win", "black_win", "draw"]);
export const Termination = pgEnum("termination", ["checkmate", "resignation", "timeout", "stalemate", "insufficient_material", "threefold_repetition", "fifty_move_rule", "agreement", "abondonment"]);

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
    timeControl: TimeControl().notNull(),
    timeLimitSecs: integer("time_limit_secs").notNull(),
    incrementSecs: integer("increment_secs").default(0),
    status: GameStatus().notNull(),
    winner: text("winner"),
    termination: Termination(),
    initialFen: text("initial_fen"),
    currentFen: text("current_fen"),
    pgn: text("pgn"),
    whiteTimeLeft: integer("white_time_left"),
    blackTimeLeft: integer("black_time_left"),
    isRated: boolean("is_rated").default(true),

    // if the game was from a tournament
    tournamentId: uuid("tournament_id").references(() => tournaments.id),

    // timestamps
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
});

// 
export const gamesRelationWithUser = relations(games, ({ one }) => ({
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
    })
}))