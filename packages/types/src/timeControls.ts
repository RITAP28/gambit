export type TimeControlName = "bullet" | "blitz" | "rapid" | "classical" | "daily";

export interface TimeControlSpec {
    name: TimeControlName;
    /** Starting time per player, in seconds. */
    initialSecs: number;
    /** Fischer increment credited after each completed move, in seconds. */
    incrementSecs: number;
    label: string;
}

/**
 * The pairings a player can queue for. Categories follow the usual convention
 * (estimated game length = initial + 40 × increment): under 3 minutes is
 * bullet, under 10 is blitz, under 30 is rapid, beyond that classical.
 */
export const TIME_CONTROLS: Record<string, TimeControlSpec> = {
    "1+0": { name: "bullet", initialSecs: 60, incrementSecs: 0, label: "1 min" },
    "2+1": { name: "bullet", initialSecs: 120, incrementSecs: 1, label: "2 | 1" },
    "3+0": { name: "blitz", initialSecs: 180, incrementSecs: 0, label: "3 min" },
    "3+2": { name: "blitz", initialSecs: 180, incrementSecs: 2, label: "3 | 2" },
    "5+0": { name: "blitz", initialSecs: 300, incrementSecs: 0, label: "5 min" },
    "5+3": { name: "blitz", initialSecs: 300, incrementSecs: 3, label: "5 | 3" },
    "10+0": { name: "rapid", initialSecs: 600, incrementSecs: 0, label: "10 min" },
    "10+5": { name: "rapid", initialSecs: 600, incrementSecs: 5, label: "10 | 5" },
    "15+10": { name: "rapid", initialSecs: 900, incrementSecs: 10, label: "15 | 10" },
    "30+0": { name: "classical", initialSecs: 1800, incrementSecs: 0, label: "30 min" },
    "30+20": { name: "classical", initialSecs: 1800, incrementSecs: 20, label: "30 | 20" }
};

export const DEFAULT_TIME_CONTROL_KEY = "5+3";

export const isTimeControlKey = (key: string): boolean =>
    Object.prototype.hasOwnProperty.call(TIME_CONTROLS, key);

export function resolveTimeControl(key: string | undefined | null): TimeControlSpec & { key: string } {
    const resolved = key && isTimeControlKey(key) ? key : DEFAULT_TIME_CONTROL_KEY;
    return { key: resolved, ...(TIME_CONTROLS[resolved] as TimeControlSpec) };
}
