import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
    user: {
        id?: string;
        name: string;
        email: string;
        accessToken: string;
    } | null;
    isAuthenticated: boolean;
    initialQuery: string | null;
}

const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    initialQuery: null
}

export const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        registration: (state, action: PayloadAction<{ user: { id?: string; name: string; email: string; accessToken: string } }>) => {
            state.user = action.payload.user;
            state.isAuthenticated = true;
        },
        login: (state, action: PayloadAction<{ user: { id?: string; name: string; email: string; accessToken: string }; isAuthenticated: boolean }>) => {
            state.user = action.payload.user;
            state.isAuthenticated = action.payload.isAuthenticated;
        },
        logout: (state) => {
            state.user = null;
            state.isAuthenticated = false;
        },
        initial: (state, action) => {
            state.initialQuery = action.payload.initialQuery
        },
        oauth: (state, action: PayloadAction<{ user: AuthState["user"]; isAuthenticated: boolean; isVerified: boolean, isOnboarded: boolean, isSubscribed: boolean }>) => {
            state.user = action.payload.user;
            state.isAuthenticated = action.payload.isAuthenticated;
        }
    }
});

export const { registration, login, logout, initial, oauth } = authSlice.actions;
export default authSlice.reducer;