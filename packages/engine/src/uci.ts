import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createInterface, type Interface } from "node:readline";
import path from "node:path";

/**
 * UCI client for Stockfish.
 *
 * The engine runs as a child process and is driven over stdin/stdout. The
 * in-process WASM build is not usable here: it writes to stdout through a
 * handle Emscripten captures at startup, so there is no way to intercept its
 * output from JavaScript. A child process also means a runaway search can be
 * killed without taking the API server with it.
 */

export interface EvaluationScore {
    /** Centipawns from White's point of view. Absent when a mate is forced. */
    cp?: number;
    /** Moves until mate, from White's point of view. Negative means Black mates. */
    mate?: number;
}

export interface PositionEvaluation extends EvaluationScore {
    bestMove: string | null;
    /** Principal variation in UCI notation. */
    pv: string[];
    depth: number;
}

export type EngineBinary = "lite-single" | "lite" | "single" | "full" | "asm";

export interface EngineOptions {
    /**
     * Which bundled binary to run. "lite-single" is single-threaded with a
     * small network: ~7MB instead of ~113MB, and it needs no shared memory,
     * which most container runtimes disallow.
     */
    binary?: EngineBinary;
    hashMb?: number;
    /** Hard ceiling on a single position analysis. */
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** Maps a binary preference onto the filename suffixes to try, best first. */
const BINARY_SUFFIXES: Record<EngineBinary, string[]> = {
    "lite-single": ["-lite-single", "-single", "-lite", ""],
    lite: ["-lite", "-lite-single", ""],
    single: ["-single", "-lite-single", ""],
    full: ["", "-lite"],
    asm: ["-asm", "-lite-single"]
};

/**
 * Locates a runnable engine script inside the installed `stockfish` package.
 * The filename carries the engine version, which changes between releases, so
 * the directory is scanned rather than a fixed name being assumed.
 */
export function resolveEnginePath(binary: EngineBinary = "lite-single"): string {
    const packageDir = path.dirname(require.resolve("stockfish"));

    for (const directory of [path.join(packageDir, "bin"), path.join(packageDir, "src")]) {
        if (!existsSync(directory)) continue;

        const candidates = readdirSync(directory).filter(
            (file) => file.startsWith("stockfish") && file.endsWith(".js")
        );

        for (const suffix of BINARY_SUFFIXES[binary]) {
            const match = candidates.find((file) =>
                new RegExp(`^stockfish(-[\\d.]+)?${escapeRegExp(suffix)}\\.js$`).test(file)
            );
            if (match) return path.join(directory, match);
        }
    }

    throw new Error(
        "Could not locate a Stockfish engine script. Is the `stockfish` package installed?"
    );
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class Engine {
    private child: ChildProcessWithoutNullStreams | null = null;
    private reader: Interface | null = null;
    private ready: Promise<void> | null = null;
    private queue: Promise<unknown> = Promise.resolve();
    private listeners = new Set<(line: string) => void>();
    private disposed = false;

    constructor(private readonly options: EngineOptions = {}) {}

    /** Boots the engine and completes the UCI handshake. Idempotent. */
    async init(): Promise<void> {
        if (this.ready) return this.ready;

        this.ready = (async () => {
            const enginePath = resolveEnginePath(this.options.binary ?? "lite-single");

            const child = spawn(process.execPath, [enginePath], {
                stdio: ["pipe", "pipe", "pipe"]
            });
            this.child = child;

            child.on("error", (error) => {
                console.error("[engine] process error:", error);
                this.teardown();
            });

            child.on("exit", (code) => {
                if (!this.disposed) console.error(`[engine] exited unexpectedly with code ${code}`);
                this.teardown();
            });

            // Line-buffering matters: a single stdout chunk routinely contains
            // several UCI lines, and one line can be split across chunks.
            this.reader = createInterface({ input: child.stdout });
            this.reader.on("line", (line) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                for (const listener of [...this.listeners]) listener(trimmed);
            });

            await this.handshake();
        })();

        return this.ready;
    }

    private handshake(): Promise<void> {
        return this.await(
            () => {
                this.send("uci");
                this.send(`setoption name Hash value ${this.options.hashMb ?? 32}`);
                this.send("setoption name Threads value 1");
                this.send("isready");
            },
            (line, resolve) => {
                if (line === "readyok") resolve();
            },
            "engine handshake timed out"
        );
    }

    private send(command: string): void {
        if (!this.child?.stdin.writable) throw new Error("engine is not running");
        this.child.stdin.write(`${command}\n`);
    }

    /**
     * Runs `issue`, then feeds every output line to `onLine` until it resolves.
     * Always detaches the listener and clears the timer, on every exit path.
     */
    private await<T>(
        issue: () => void,
        onLine: (line: string, resolve: (value: T) => void) => void,
        timeoutMessage: string
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(
                () => {
                    cleanup();
                    reject(new Error(timeoutMessage));
                },
                this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
            );

            const cleanup = () => {
                clearTimeout(timer);
                this.listeners.delete(listener);
            };

            const listener = (line: string) => {
                onLine(line, (value) => {
                    cleanup();
                    resolve(value);
                });
            };

            this.listeners.add(listener);

            try {
                issue();
            } catch (error) {
                cleanup();
                reject(error);
            }
        });
    }

    /** Serialises jobs so two analyses never share the engine's search state. */
    private enqueue<T>(job: () => Promise<T>): Promise<T> {
        const result = this.queue.then(job, job);
        // Keep the chain alive even when a job rejects.
        this.queue = result.catch(() => undefined);
        return result;
    }

    /**
     * Evaluates a single position to a fixed depth.
     *
     * UCI reports scores relative to the side to move; they are normalised here
     * to White's perspective so a rising number always means "better for White".
     */
    async evaluate(fen: string, depth: number): Promise<PositionEvaluation> {
        await this.init();

        return this.enqueue(async () => {
            const whiteToMove = fen.split(" ")[1] !== "b";
            let latest: PositionEvaluation = { bestMove: null, pv: [], depth: 0 };

            return this.await<PositionEvaluation>(
                () => {
                    this.send("ucinewgame");
                    this.send(`position fen ${fen}`);
                    this.send(`go depth ${depth}`);
                },
                (line, resolve) => {
                    if (line.startsWith("info ") && line.includes(" score ")) {
                        const parsed = parseInfoLine(line, whiteToMove);
                        // Replace rather than merge: a position that was `cp` at
                        // one depth can become `mate` at the next, and a stale
                        // `cp` left alongside `mate` would be read as both.
                        if (parsed) {
                            latest = {
                                bestMove: latest.bestMove,
                                depth: parsed.depth ?? 0,
                                pv: parsed.pv ?? [],
                                ...(parsed.mate !== undefined
                                    ? { mate: parsed.mate }
                                    : { cp: parsed.cp ?? 0 })
                            };
                        }
                        return;
                    }

                    if (line.startsWith("bestmove")) {
                        const best = line.split(/\s+/)[1];
                        resolve({
                            ...latest,
                            bestMove: best && best !== "(none)" ? best : null
                        });
                    }
                },
                `engine timed out evaluating ${fen}`
            );
        });
    }

    /** Stops any in-flight search without shutting the engine down. */
    stop(): void {
        if (this.child?.stdin.writable) this.send("stop");
    }

    /** Shuts the engine down. Safe to call more than once. */
    dispose(): void {
        this.disposed = true;
        if (this.child?.stdin.writable) {
            try {
                this.send("quit");
            } catch {
                // Already gone; the kill below is the backstop.
            }
        }
        this.child?.kill();
        this.teardown();
    }

    private teardown(): void {
        this.reader?.close();
        this.reader = null;
        this.child = null;
        this.ready = null;
        this.listeners.clear();
    }
}

/**
 * Extracts depth, score and principal variation from a UCI `info` line.
 * Returns null for lines carrying no usable score (e.g. `info string ...`).
 */
export function parseInfoLine(
    line: string,
    whiteToMove: boolean
): Partial<PositionEvaluation> | null {
    const tokens = line.split(/\s+/);

    const scoreIndex = tokens.indexOf("score");
    if (scoreIndex === -1) return null;

    const kind = tokens[scoreIndex + 1];
    const rawValue = Number(tokens[scoreIndex + 2]);
    if (!Number.isFinite(rawValue)) return null;

    // Flip when Black is to move so every score reads "positive is good for White".
    const perspective = whiteToMove ? 1 : -1;

    const depthIndex = tokens.indexOf("depth");
    const depth = depthIndex === -1 ? 0 : Number(tokens[depthIndex + 1]) || 0;

    const pvIndex = tokens.indexOf("pv");
    const pv = pvIndex === -1 ? [] : tokens.slice(pvIndex + 1);

    if (kind === "mate") {
        // `score mate 0` means the side to move is *already* checkmated, so the
        // opponent has won. Multiplying zero by the perspective would discard
        // that sign and report the wrong winner, so it is mapped explicitly.
        const mate = rawValue === 0 ? (whiteToMove ? -1 : 1) : rawValue * perspective;
        return { depth, pv, mate };
    }

    return { depth, pv, cp: rawValue * perspective };
}

/** Process-wide engine. Booting Stockfish is expensive; one instance is plenty. */
let shared: Engine | null = null;

export function getSharedEngine(options?: EngineOptions): Engine {
    if (!shared) shared = new Engine(options);
    return shared;
}

export function disposeSharedEngine(): void {
    shared?.dispose();
    shared = null;
}
