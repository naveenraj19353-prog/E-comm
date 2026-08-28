import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ThemePreviewDraft } from "../../theme/themeStorage";

interface ThemeCustomizerState {
    livePreview: ThemePreviewDraft | null;
    revision: number;
}

const initialState: ThemeCustomizerState = {
    livePreview: null,
    revision: 0,
};

const themeCustomizerSlice = createSlice({
    name: "themeCustomizer",
    initialState,
    reducers: {
        setLiveThemePreview(state, action: PayloadAction<ThemePreviewDraft | null>) {
            state.livePreview = action.payload;
            state.revision += 1;
        },
        bumpThemeRevision(state) {
            state.revision += 1;
        },
        clearLiveThemePreview(state) {
            state.livePreview = null;
            state.revision += 1;
        },
    },
});

export const {
    setLiveThemePreview,
    bumpThemeRevision,
    clearLiveThemePreview,
} = themeCustomizerSlice.actions;

export default themeCustomizerSlice.reducer;
