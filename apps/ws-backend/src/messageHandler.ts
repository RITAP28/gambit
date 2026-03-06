import { verifyAccessToken } from "@repo/auth";
import { WebSocket } from "ws";
import { onlineUsers, usersSearchingForMatch } from "./server";
import { broadcastOnlineUsers, sendMessage } from "./connection";
import { db } from "../../../packages/db/src";
import { games } from "../../../packages/db/src/schema/game";
import { fetchUserSession } from "../../../packages/utils/src";

export async function handleUserConnection(ws: WebSocket, message: any, currentUserId: string | null) {
    const { userId, accessToken } = message;

    const session = await fetchUserSession(userId);
    const decoded = await verifyAccessToken(accessToken, session.refreshToken);
    
    onlineUsers.set(decoded.payload.userId, ws);
    currentUserId = decoded.payload.userId;
    broadcastOnlineUsers();
    
    console.log(`User ${userId} connected to the websocket`);
    
    // send confirmation
    ws.send(JSON.stringify({
        action: 'connection-established',
        userId: userId,
        accessToken: decoded.newAccessToken,
        message: 'Successfully connected'
    }));
};

export async function handleMatchPlayer(ws: WebSocket, message: any) {
    // structure of the message to be received
    // message = {
    //     action: 'match-player',
    //     userId: userId,
    // }
    const { userId } = message;

    // adding user to the search queue/map or returning if it already exists
    if (usersSearchingForMatch.has(userId)) return;
    usersSearchingForMatch.set(userId, ws);

    if (usersSearchingForMatch.size < 2) {
        console.log('Waiting for opponent...');
        return;
    };

    const players = Array.from(usersSearchingForMatch.keys());

    const player1 = players[0];
    const player2 = players[1];

    const ws1 = usersSearchingForMatch.get(player1);
    const ws2 = usersSearchingForMatch.get(player2);

    // removing both users from the queue/map
    usersSearchingForMatch.delete(player1);
    usersSearchingForMatch.delete(player2);

    console.log(`Match found: ${player1} vs ${player2}`);

    // game can be created in the db as both the players have been matched
    const newGame = (
        await db
            .insert(games)
            .values({
                whitePlayerId: player1,
                blackPlayerId: player2,

                timeControl: 'blitz',
                timeLimitSecs: 300,
                incrementSecs: 2,

                status: 'in_progress',

                initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",

                whiteTimeLeft: 300,
                blackTimeLeft: 300,

                isRated: false,

                startedAt: new Date(),
                endedAt: new Date()
            })
            .returning()
    )[0];

    sendMessage(ws1, 'match-found', {
        action: 'match-found',
        userId: player1,
        opponentId: player2,
        gameId: newGame.id,
        color: 'white'
    });

    sendMessage(ws2, 'match-found', {
        action: 'match-found',
        userId: player2,
        opponentId: player1,
        gameId: newGame.id,
        coloe: 'black'
    });
};