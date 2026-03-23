// packages/db/src/schema/chat.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { games } from "./game";
import { relations } from "drizzle-orm";

export const chatMessages = pgTable("chat_messages", {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id").references(() => games.id, { onDelete: 'cascade' }).notNull(),
    senderId: uuid("sender_id").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatMessageRelations = relations(chatMessages, ({ one }) => ({
    game: one(games, {
        fields: [chatMessages.gameId],
        references: [games.id],
    }),
}));