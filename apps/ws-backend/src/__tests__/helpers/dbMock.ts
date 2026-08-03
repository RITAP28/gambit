import { vi } from "vitest";

/**
 * A stand-in for `@repo/db` that records writes without touching Postgres.
 *
 * Every Drizzle builder returns a thenable chain, so handlers can `await` any
 * of insert/update/select/delete regardless of how far they take the chain.
 */
export function makeDbMock() {
    const inserted: Record<string, unknown[]> = {};
    const updated: unknown[] = [];

    const returning = (rows: unknown[]) => vi.fn().mockResolvedValue(rows);

    const db = {
        insert: vi.fn(() => ({
            values: vi.fn((values: unknown) => {
                inserted.rows ??= [];
                inserted.rows.push(values);
                const chain = {
                    returning: returning([{ id: "generated-id", createdAt: new Date(), ...(values as object) }]),
                    onConflictDoNothing: vi.fn().mockResolvedValue(undefined)
                };
                return Object.assign(Promise.resolve([{ id: "generated-id" }]), chain);
            })
        })),

        update: vi.fn(() => ({
            set: vi.fn((values: unknown) => {
                updated.push(values);
                const chain = { returning: returning([{ id: "generated-id" }]) };
                return {
                    where: vi.fn(() => Object.assign(Promise.resolve([{ id: "generated-id" }]), chain))
                };
            })
        })),

        select: vi.fn(() => ({
            from: vi.fn(() => {
                const result: unknown[] = [];
                const chain = {
                    where: vi.fn(() =>
                        Object.assign(Promise.resolve(result), {
                            orderBy: vi.fn().mockResolvedValue(result)
                        })
                    ),
                    orderBy: vi.fn().mockResolvedValue(result)
                };
                return Object.assign(Promise.resolve(result), chain);
            })
        })),

        delete: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined)
        }))
    };

    const table = (name: string) => ({ _: { name } }) as unknown;

    return {
        db,
        __inserted: inserted,
        __updated: updated,

        games: table("games"),
        moves: table("moves"),
        chatMessages: table("chat_messages"),
        sessions: table("sessions"),
        users: table("users"),
        ratings: table("ratings"),
        matchMakingQueues: table("match_making_queues"),

        eq: vi.fn((a: unknown, b: unknown) => ({ op: "eq", a, b })),
        ne: vi.fn((a: unknown, b: unknown) => ({ op: "ne", a, b })),
        and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
        or: vi.fn((...args: unknown[]) => ({ op: "or", args })),
        not: vi.fn((a: unknown) => ({ op: "not", a })),
        asc: vi.fn((a: unknown) => a),
        desc: vi.fn((a: unknown) => a),
        sql: vi.fn(),
        inArray: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        isNull: vi.fn(),
        count: vi.fn(),
        testDatabaseConnection: vi.fn().mockResolvedValue(true)
    };
}
