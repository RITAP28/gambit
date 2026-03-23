export enum authProvider {
  CREDENTIALS = "credentials",
  GOOGLE = "google",
  APPLE = "apple"
};

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