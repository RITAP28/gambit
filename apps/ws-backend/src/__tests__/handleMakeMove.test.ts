import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeGames } from '../server';
import { Chess } from 'chess.js';
import { handleMakeMove } from '../messageHandler';
import { broadcastToGame } from '../utils/broadcastToGame';

vi.mock('@repo/db', () => ({
    db: {
        insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{
                    id: 'mock-id-1',
                    gameId: 'game-123',
                    moveNumber: 1,
                    san: 'e4',
                    uci: 'e2e4',
                }])
            })
        }),

        update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined)
            })
        })
    }
}));

vi.mock('../utils/broadcastToGame.ts', () => ({
    broadcastToGame: vi.fn()
}))

const mockWs = (playerId: string) => ({
    playerId,
    send: vi.fn(),
});

describe('handleMakeMove', () => {
    const gameId = 'game-123';
    beforeEach(() => {
        vi.clearAllMocks();
        activeGames.set(gameId, {
            gameId,
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

    it('broadcasts move to both players', async () => {
        const ws = mockWs('player-white');
        // await handleMakeMove(ws as any, makeMessage(gameId, 'e2e4'));
        await handleMakeMove(ws as any, { action: 'possible-move', data: { gameId: gameId, playerId: 'player-white', uci: 'e2e4', color: 'w' } });

        expect(broadcastToGame).toHaveBeenCalledWith(gameId, expect.objectContaining({
            action: 'move-successful',
        }));
    });

    // check passed
    it('rejects move if game does not exist', async () => {
        const ws = mockWs('player-white');
        await handleMakeMove(ws as any, { action: 'possible-move', data: { gameId: 'nonexistent-game', playerId: 'player-white', uci: 'e2e4', color: 'w' } });
        expect(ws.send).not.toHaveBeenCalled();
    });

    // check passed
    it('rejects move if it is not the player\'s turn', async () => {
        const ws = mockWs('player-black');
        await handleMakeMove(ws as any, { action: 'possible-move', data: { gameId: gameId, playerId: 'player-black', uci: 'e7e5', color: 'b' } });

        const response = JSON.parse(ws.send.mock.calls[0][0]);
        expect(response.action).toBe('not-your-turn');
    });

    it('rejects an illegal move', async () => {
        const ws = mockWs('player-white');
        await handleMakeMove(ws as any, { action: 'possible-move', data: { gameId: gameId, playerId: 'player-white', uci: 'e2e5', color: 'w' } });

        const response = JSON.parse(ws.send.mock.calls[0][0]);
        expect(response.action).toBe('illegal-move');
    });

    it('applies a legal move and updates game state', async () => {
        const ws = mockWs('player-white');
        await handleMakeMove(ws as any, { action: 'possible-move', data: { gameId: gameId, playerId: 'player-white', uci: 'e2e4', color: 'w' } });

        const updatedGame = activeGames.get(gameId)!;
        expect(updatedGame.chess.history()).toContain('e4');
        expect(updatedGame.activeColor).toBe('black');
    });

    it('deducts time from the correct player clock', async () => {
        const ws = mockWs('player-white');
        const before = activeGames.get(gameId)!.clocks.white;

        await handleMakeMove(ws as any, { action: 'possible-move', data: { gameId: gameId, playerId: 'player-white', uci: 'e2e4', color: 'w' } });

        const after = activeGames.get(gameId)!.clocks.white;
        expect(after).toBeLessThan(300_000);         // decreased from 300,000ms
        expect(after).toBeGreaterThan(290_000);
        expect(activeGames.get(gameId)!.clocks.black).toBe(300_000); // black untouched
    });

    it('detects checkmate and broadcasts winner', async () => {
        // Fool's mate setup
        const game = activeGames.get(gameId)!;
        game.chess.load('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
        game.whitePlayerId = 'player-white';
        game.blackPlayerId = 'player-black';
        game.moveStartTime = Date.now();

        // It's white's turn but they're in checkmate — simulate black delivering it
        game.chess.load('rnb1kbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2');
        activeGames.set(gameId, { ...game, activeColor: 'black' });

        const ws = mockWs('player-black');
        await handleMakeMove(ws as any, { action: 'possible-move', data: { gameId: gameId, playerId: 'player-black', uci: 'h4h1', color: 'w' } });
    });
})