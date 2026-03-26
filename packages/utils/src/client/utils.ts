export const IDarkMode = {
    DARK: "DARK",
    LIGHT: "LIGHT"
} as const;
export type IDarkMode = (typeof IDarkMode)[keyof typeof IDarkMode];