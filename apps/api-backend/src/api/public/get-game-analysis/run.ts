import { NextFunction, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { sendResponse } from "@repo/utils/src";
import { analyseGame, getSharedEngine, type GameAnalysis } from "@repo/engine";

import { fetchGameMoves } from "./constants";
import { buildAnalysisPrompt } from "./prompt";
import backendConfig from "../../../infra/activeconfig";
import { fetchExistingGame } from "../../../services/game.service";

const geminiApiKey = backendConfig.GEMINI_API_KEY;
const gemini = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

const TERMINAL_STATUSES = [
    "checkmate",
    "timeout",
    "stalemate",
    "insufficient_material",
    "threefold_repetition",
    "fifty_move_rule",
    "resignation",
    "agreement",
    null
];

/**
 * Streams a two-stage game analysis over Server-Sent Events.
 *
 * Stage one runs Stockfish over every position and produces the hard numbers:
 * per-move evaluations, blunder classification and accuracy. Stage two hands
 * those numbers to a language model purely for narration. Splitting it this way
 * means the judgements a reader will trust come from an engine, and the model
 * cannot invent an evaluation.
 */
export const run = async (req: Request, res: Response, _next: NextFunction) => {
    const startTime = Date.now();
    const { data } = req.body as { data?: { gameId?: string; depth?: number } };

    const gameId = data?.gameId;
    if (!gameId) return sendResponse(res, 400, false, "bad request, invalid game id");

    let gameMoves;
    let gameMetadata;

    try {
        gameMoves = await fetchGameMoves(gameId);
        if (gameMoves.length === 0) {
            return sendResponse(res, 400, false, "unable to provide analysis, no moves to analyse");
        }

        gameMetadata = await fetchExistingGame(gameId);
        if (!gameMetadata) return sendResponse(res, 404, false, "game not found");
        if (gameMetadata.status !== "completed") {
            return sendResponse(res, 400, false, "game not completed, bad request");
        }
        if (!TERMINAL_STATUSES.includes(gameMetadata.termination)) {
            return sendResponse(res, 400, false, "analysis not possible for this game");
        }
    } catch (error) {
        console.error("[game-analysis] lookup failed:", error);
        return sendResponse(res, 500, false, "internal server error");
    }

    // Past this point the response is a stream, so errors are reported as SSE
    // events rather than status codes — the headers have already gone out.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (payload: unknown) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    // Stop working if the user navigates away mid-stream; engine analysis is
    // expensive and nobody is waiting for it any more.
    let aborted = false;
    req.on("close", () => {
        aborted = true;
    });

    const depth = clampDepth(data?.depth ?? backendConfig.ANALYSIS_DEPTH);
    const sanMoves = gameMoves.map((move) => move.san);

    let analysis: GameAnalysis;
    try {
        send({ type: "status", phase: "engine", message: "Analysing with Stockfish" });

        analysis = await analyseGame(sanMoves, {
            depth,
            engine: getSharedEngine({ binary: "lite-single", hashMb: 64 }),
            onProgress: (completed, total) => {
                if (!aborted) send({ type: "engine-progress", completed, total });
            }
        });
    } catch (error) {
        console.error("[game-analysis] engine failed:", error);
        send({ type: "error", error: "engine analysis failed" });
        res.end();
        return;
    }

    if (aborted) {
        res.end();
        return;
    }

    // The structured analysis stands on its own, so it is sent before the prose
    // and the client can draw the evaluation graph immediately.
    send({ type: "engine-analysis", analysis });

    if (!gemini) {
        send({
            type: "done",
            metadata: {
                depth,
                movesAnalysed: analysis.moves.length,
                processingTime: Date.now() - startTime,
                commentary: false,
                error: null
            }
        });
        res.end();
        return;
    }

    const prompt = buildAnalysisPrompt({
        result: gameMetadata.result,
        winner: gameMetadata.winner,
        timeControl: gameMetadata.timeControl,
        analysis
    });

    const model = "gemini-2.5-flash-lite";
    const config = { temperature: 0.7, topK: 40, topP: 0.95, maxOutputTokens: 4096 };

    let fullResponse = "";
    let lastChunk;

    try {
        send({ type: "status", phase: "commentary", message: "Writing your analysis" });

        const stream = await gemini.models.generateContentStream({
            model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config
        });

        for await (const chunk of stream) {
            if (aborted) break;
            lastChunk = chunk;

            const chunkText = chunk.text;
            if (chunkText) {
                fullResponse += chunkText;
                send({ type: "chunk", content: chunkText });
            }
        }

        send({
            type: "done",
            metadata: {
                model,
                depth,
                movesAnalysed: analysis.moves.length,
                tokensUsed: lastChunk?.usageMetadata?.totalTokenCount ?? 0,
                processingTime: Date.now() - startTime,
                temperature: config.temperature,
                commentary: true,
                error: null
            }
        });
    } catch (error: any) {
        console.error("[game-analysis] commentary failed:", error);
        // The engine analysis already reached the client, so this degrades
        // rather than fails: the numbers survive, only the prose is lost.
        send({
            type: "error",
            error: error?.message ?? "commentary generation failed",
            partialContent: fullResponse,
            engineAnalysisDelivered: true
        });
    }

    res.end();
};

/** Depth is caller-controllable, and engine cost grows sharply with it. */
const clampDepth = (depth: number): number => {
    if (!Number.isFinite(depth)) return 12;
    return Math.min(Math.max(Math.floor(depth), 6), 18);
};
