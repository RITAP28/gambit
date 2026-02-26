import { pgEnum } from "drizzle-orm/pg-core";

export const timeControlEnum = pgEnum("time_control_enum", ["bullet", "blitz", "rapid", "classical", "daily"]);
export const gameStatusEnum = pgEnum("game_status_enum", ["waiting", "in_progress", "completed", "abandoned", "aborted"]);
export const gameResultEnum = pgEnum("game_result_enum", ["white_win", "black_win", "draw"]);
export const terminationEnum = pgEnum("termination", ["checkmate", "resignation", "timeout", "stalemate", "insufficient_material", "threefold_repetition", "fifty_move_rule", "agreement", "abondonment"]);