export const authProvider = {
  CREDENTIALS: "credentials",
  GOOGLE: "google",
  APPLE: "apple"
} as const;
export type authProvider = (typeof authProvider)[keyof typeof authProvider]

export interface IPlayerCardProps {
  id: string;
  username: string;
  rating?: number;
  color: string;
  isActive: boolean;
  time: number;
}

export interface IClockProps {
  userId: string;
  time: number;
  isActive: boolean;
  color: string;
}

export interface IPlayerMetadataProps {
  id: string;
  username: string;
  email: string;
  rating: number;
  color: "w" | "b";
  time: number;
  isActive: boolean;
  capturedBy: []
}

export interface ChatMessage {
    action: string;
    data: {
        gameId: string;
        senderId: string;
        message: string;
    };
}

export interface IGameMoves {
  id: string;
  gameId: string;
  moveNumber: number;
  color: "white" | "black";
  san: string;
  uci: string;
  fenAfter: string;
  timeTaken: number;
  clockAfter: number;
  createdAt: Date;
}