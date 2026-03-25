import { GoogleGenAI } from "@google/genai";
import backendConfig from "../infra/activeconfig"
import { IGameMoves } from "../../../../packages/types/src";

interface IBuildPrompt {
    result: string;
    winner: string | null;
    moves: IGameMoves[];
    color: 'white' | 'black' | null;
}

const geminiApiKey = backendConfig.GEMINI_API_KEY;

export class PromptService {
    private gemini: GoogleGenAI;
    private buildPrompt(data: IBuildPrompt) {
        
    }
}