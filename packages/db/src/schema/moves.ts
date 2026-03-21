import { integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { games } from "./game";
import { relations } from "drizzle-orm";

export const moveColorEnum = pgEnum("move_color_enum", ["white", "black"]);

export const moves = pgTable("moves", {
    // related IDs
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id").references(() => games.id, { onDelete: 'cascade' }).notNull(),

    // metadata
    moveNumber: integer("move_number").notNull(),
    color: moveColorEnum().notNull(),
    san: varchar("san", { length: 255 }).notNull(),
    uci: varchar("uci", { length: 255 }).notNull(),
    fenAfter: text("fen_after").notNull(),

    // timestamps
    timeTaken: integer("time_taken_milliseconds").notNull(),
    clockAfter: integer("clock_after_milliseconds").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
});

// many-to-one relationship with game schema
export const moveRelationWithGame = relations(moves, ({ one }) => ({
    game: one(games, {
        fields: [moves.gameId],
        references: [games.id]
    })
}))