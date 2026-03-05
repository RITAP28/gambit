import type { User } from "./types";

export interface UserReducerInitialState {
    currentUser: User | null;
    error: string | null;
    loading: boolean;
    isAuthenticated: boolean;
}