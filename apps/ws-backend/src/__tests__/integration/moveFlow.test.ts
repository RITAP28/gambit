import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import { activeGames } from '../../server'; // your ws server factory
import { createWsServer } from '../../utils/createWebsocketServer';

// mocking the DB layer only
vi.mock('@repo/utils/src/db.queries', () => ({
    updateGameState: vi.fn().mockResolvedValue(undefined),
    insertMove: vi.fn().mockResolvedValue({
        id: 'move-id-1',
        gameId: 'integration-game-1',
        moveNumber: 1,
        san: 'e4',
        uci: 'e2e4',
    }),
}));

// helper functions & constants
const TEST_PORT = 9999;
const WS_URL = `ws://localhost:${TEST_PORT}`;
const GAME_ID = 'integration-game-1';

const connectClient = (url: string): Promise<WebSocket> =>
    new Promise((resolve) => {
        const ws = new WebSocket(url);
        ws.on('open', () => resolve(ws));
    });

const waitForMessage = (ws: WebSocket): Promise<any> =>
    new Promise((resolve) => {
        ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });

const sendMessage = (ws: WebSocket, action: string, data: object) =>
    ws.send(JSON.stringify({ action, data }));

// tests
describe('WebSocket move flow (integration)', () => {
    let server: WebSocketServer;
    let whiteClient: WebSocket;
    let blackClient: WebSocket;

    beforeAll(async () => {
        // starting the actual WS server on a test port
        server = await createWsServer(TEST_PORT);
    });

    afterAll(() => {
        whiteClient?.close();
        blackClient?.close();
        server.close();
    });

    beforeEach(() => {
        // seeding game state directly — bypasses matchmaking for integration tests
        activeGames.set(GAME_ID, {
            gameId: GAME_ID,
            whitePlayerId: 'player-white',
            blackPlayerId: 'player-black',
            chess: new Chess(),
            activeColor: 'white',
            lastMove: '',
            lastMoveTime: 0,
            moveStartTime: Date.now() - 3000,
            clocks: { white: 300_000, black: 300_000 },
        });
    });

    it('both clients receive move-made after a legal move', async () => {
        whiteClient = await connectClient(WS_URL);
        blackClient = await connectClient(WS_URL);

        // registring both connections so broadcastToGame can find them
        // this depends on how the server maps playerId → socket
        // e.g. if we send an 'identify' message on connect:
        sendMessage(whiteClient, 'identify', { playerId: 'player-white' });
        sendMessage(blackClient, 'identify', { playerId: 'player-black' });

        // small delay to let identify messages process
        await new Promise((r) => setTimeout(r, 50));

        // listening for broadcast on both clients before sending the move
        const whiteReceived = waitForMessage(whiteClient);
        const blackReceived = waitForMessage(blackClient);

        // White makes a move
        sendMessage(whiteClient, 'possible-move', {
            gameId: GAME_ID,
            playerId: 'player-white',
            uci: 'e2e4',
        });

        // both should receive the broadcast
        const [whiteMsg, blackMsg] = await Promise.all([whiteReceived, blackReceived]);

        expect(whiteMsg.action).toBe('move-made');
        expect(whiteMsg.data.uci).toBe('e2e4');
        expect(blackMsg.action).toBe('move-made');
        expect(blackMsg.data.uci).toBe('e2e4');
    });

    it('only the moving client receives illegal-move', async () => {
        whiteClient = await connectClient(WS_URL);
        blackClient = await connectClient(WS_URL);

        sendMessage(whiteClient, 'identify', { playerId: 'player-white' });
        sendMessage(blackClient, 'identify', { playerId: 'player-black' });
        await new Promise((r) => setTimeout(r, 50));

        const whiteReceived = waitForMessage(whiteClient);

        sendMessage(whiteClient, 'possible-move', {
            gameId: GAME_ID,
            playerId: 'player-white',
            uci: 'e2e5', // illegal
        });

        const msg = await whiteReceived;
        expect(msg.action).toBe('illegal-move');
    });

    it('black cannot move on white\'s turn', async () => {
        whiteClient = await connectClient(WS_URL);
        blackClient = await connectClient(WS_URL);

        sendMessage(whiteClient, 'identify', { playerId: 'player-white' });
        sendMessage(blackClient, 'identify', { playerId: 'player-black' });
        await new Promise((r) => setTimeout(r, 50));

        const blackReceived = waitForMessage(blackClient);

        sendMessage(blackClient, 'possible-move', {
            gameId: GAME_ID,
            playerId: 'player-black',
            uci: 'e7e5', // legal move but wrong turn
        });

        const msg = await blackReceived;
        expect(msg.action).toBe('not-your-turn');
    });

    it('clocks are updated after a move', async () => {
        whiteClient = await connectClient(WS_URL);
        blackClient = await connectClient(WS_URL);

        sendMessage(whiteClient, 'identify', { playerId: 'player-white' });
        sendMessage(blackClient, 'identify', { playerId: 'player-black' });
        await new Promise((r) => setTimeout(r, 50));

        const received = waitForMessage(whiteClient);
        sendMessage(whiteClient, 'possible-move', {
            gameId: GAME_ID,
            playerId: 'player-white',
            uci: 'e2e4',
        });

        const msg = await received;
        expect(msg.data.clocks.white).toBeLessThan(300_000); // deducted
        expect(msg.data.clocks.black).toBe(300_000);         // untouched
    });
});