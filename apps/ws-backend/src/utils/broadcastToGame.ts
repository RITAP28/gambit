import { activeGames, onlineUsers } from "../server"

export const broadcastToGame = async (gameId: string, payload: { action: string; data: any }) => {
    console.log('message to be broadcasted: ', payload);
    const game = activeGames.get(gameId);
    const whiteSocket = onlineUsers.get(game.whitePlayerId);
    const blackSocket = onlineUsers.get(game.blackPlayerId);

    // sending the payload to both players
    whiteSocket.send(JSON.stringify({ action: payload.action, data: payload.data }));
    blackSocket.send(JSON.stringify({ action: payload.action, data: payload.data }));
};