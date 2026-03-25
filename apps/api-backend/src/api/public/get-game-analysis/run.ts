import { fetchExistingGame, sendResponse } from "@repo/utils/src";
import { NextFunction, Request, Response } from "express";
import { fetchGameMoves } from "./constants";
import backendConfig from "../../../infra/activeconfig";
import { GoogleGenAI } from "@google/genai";

const geminiApiKey = backendConfig.GEMINI_API_KEY;
const gemini = new GoogleGenAI({ apiKey: geminiApiKey! });

export const run = async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const { action, data } : { action: string, data: { gameId: string }} = req.body;
    console.log('type of the request: ', action);

    const gameId = data.gameId;
    if (!gameId) return sendResponse(res, 400, false, 'bad request, invalid game id');

    if (!geminiApiKey) return sendResponse(res, 400, false, 'no api key provided');

    try {
        // 1. fetching game moves for the player
        const gameMoves = await fetchGameMoves(gameId);
        if (gameMoves.length === 0) return sendResponse(res, 400, false, 'unable to provide analysis, no moves to analyse');

        // 2. fetching the result and the reason of the match's conclusion
        // 3. continue if the match is either drawn or completed (won/lost), return for resignation/abandonment
        const gameMetadata = await fetchExistingGame(gameId);
        if (!gameMetadata) return sendResponse(res, 404, false, 'game not found');
        if (gameMetadata.status !== 'completed') return sendResponse(res, 400, false, 'game not completed, bad request');


        const terminalStatuses = ['checkmate', 'timeout', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule', 'resignation']
        if (!terminalStatuses.includes(gameMetadata.termination)) return sendResponse(res, 400, false, 'analysis not possible for this game')

        const result = gameMetadata.result;
        const winner = gameMetadata.winner;

        const movesText = gameMoves.map((m) => `${m.moveNumber}. ${m.color === 'white' ? '' : '...'}${m.san}`).join(' ');

        // 4. provide the whole context of the match to the LLM API
        const prompt = `
        You are a chess coach analyzing a completed game. Be specific, educational, and concise.

        Game Information:
            - Result: ${result}
            - Winner: ${winner ?? 'Draw'}
            - Total moves: ${gameMoves.length}
            - Time control: ${gameMetadata.timeControl}

        Move History (PGN format): ${movesText}

        Please provide:
            1. A brief overall summary of how the game went (2-3 sentences)
            2. Key turning points — moments where the advantage shifted significantly
            3. Notable mistakes or blunders by either side
            4. What the losing side could have done differently
            5. What the winning side did well
            6. One concrete thing each player can work on to improve

        Keep the analysis clear and useful for club-level players. Reference specific moves by their move number and notation where relevant.
        `;

        const model = 'gemini-2.5-flash-lite';
        const config = {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192
        };

       // setting up SSE headers
       res.setHeader('Content-Type', 'text/event-stream')
       res.setHeader('Cache-Control', 'no-cache');
       res.setHeader('Connection', 'keep-alive');
       res.setHeader('X-Accel-Buffering', 'no');

       res.write(`data: ${JSON.stringify({
            type: 'game-analysis',
            message: 'getting your analysis'
       })}\n\n`);

       let fullResponse = '';
       let lastChunk;

       try {
            const response = await gemini.models.generateContentStream({
                model: model,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config
            });

            for await (const chunk of response) {
                lastChunk = chunk;
                const chunkText = chunk.text;

                if (chunkText) {
                    fullResponse += chunk.text;

                    // sending chunk to client
                    res.write(`data: ${JSON.stringify({
                        type: 'chunk',
                        content: chunkText
                    })}\n\n`);
                }
            };

            // usageMetadata, basically token count and all
            const usageMetadata = lastChunk?.usageMetadata;
            const totalTokens = usageMetadata?.totalTokenCount || 0;
            const processingTime = Date.now() - startTime;

            // sending completion message
            res.write(`data: ${JSON.stringify({
                type: 'done',
                metadata: {
                    model: model,
                    tokensUsed: totalTokens,
                    processingTime: processingTime,
                    temperature: config.temperature,
                    error: null
                }
            })}\n\n`);
            res.end();
       } catch (error: any) {
            console.error('Streaming error: ', error);
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: error.message || 'An error occured while generating the analysis',
                partialContent: fullResponse
            })}\n\n`);

            res.end();
       }

        // 5. stream the response back to the client along with the moves inside the response
    } catch (error) {
        console.error('[game-analysis] error: ', error);
        return sendResponse(res, 500, false, 'internal server error');
    }
}