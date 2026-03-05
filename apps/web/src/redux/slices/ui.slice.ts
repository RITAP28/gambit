import { createSlice } from "@reduxjs/toolkit";
import { IDarkMode } from "@repo/utils/src/client/utils";

const initialState = {
    sidebarOpen: true, // default state
    darkMode: IDarkMode.DARK,
    courseSidebar: true,
    toolsBar: false,
    envToolsBar: true,
    refreshSidebar: 0
};

const uiSlice = createSlice({
    name: "ui",
    initialState,
    reducers: {
        toggleSidebar: (state) => {
            state.sidebarOpen = !state.sidebarOpen;
        },
        toggleDarkMode: (state, action) => {
            state.darkMode = action.payload.darkMode;
        },
        toggleCourseSidebar: (state) => {
            state.courseSidebar = !state.courseSidebar
        },
        toggleToolsBar: (state) => {
            state.toolsBar = !state.toolsBar
        },
        toggleEnvToolsBar: (state) => {
            state.envToolsBar = !state.envToolsBar
        },
        triggerFramesRefresh: (state) => {
            state.refreshSidebar += 1
        }
    }
});

export const { toggleSidebar, toggleCourseSidebar, toggleDarkMode, toggleToolsBar, toggleEnvToolsBar, triggerFramesRefresh } = uiSlice.actions;
export default uiSlice.reducer;