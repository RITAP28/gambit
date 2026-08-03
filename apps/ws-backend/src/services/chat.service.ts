import { asc, chatMessages, db, eq } from "@repo/db";

export const insertChatMessage = async (gameId: string, senderId: string, message: string) => {
    const [saved] = await db
        .insert(chatMessages)
        .values({ gameId, senderId, message })
        .returning();

    if (!saved) throw new Error("failed to persist chat message");
    return saved;
};

export const getChatHistory = async (gameId: string) => {
    return db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.gameId, gameId))
        .orderBy(asc(chatMessages.createdAt));
};
