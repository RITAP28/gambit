import { activeGames, onlineUsers } from "../server"

export const broadcastToGame = async (gameId: string, payload: any) => {
    console.log('move-made');
    const game = activeGames.get(gameId);
    const whiteSocket = onlineUsers.get(game.whitePlayerId);
    const blackSocket = onlineUsers.get(game.blackPlayerId);

    // sending the payload to both players
    whiteSocket.send(JSON.stringify({ action: 'move-made', payload }));
    blackSocket.send(JSON.stringify({ action: 'move-made', payload }));
};