import { afterEach, describe, expect, it, vi } from "vitest";
import { getPubSub, INSTANCE_ID, NoopPubSub, resetPubSub } from "../pubsub";

describe("pubsub selection", () => {
    afterEach(async () => {
        await resetPubSub();
    });

    /**
     * Local development and single-node deployments must work with no Redis
     * running at all, so the absence of a URL is a supported configuration
     * rather than an error.
     */
    it("falls back to a no-op bus when no URL is configured", () => {
        const bus = getPubSub(undefined);

        expect(bus).toBeInstanceOf(NoopPubSub);
        expect(bus.enabled).toBe(false);
    });

    it("returns the same instance on repeated calls", () => {
        expect(getPubSub(undefined)).toBe(getPubSub(undefined));
    });

    it("accepts publish and subscribe without a broker present", async () => {
        const bus = getPubSub(undefined);
        const handler = vi.fn();

        await expect(bus.subscribe("chess:game-events", handler)).resolves.toBeUndefined();
        await expect(bus.publish("chess:game-events", { hello: "world" })).resolves.toBeUndefined();

        // Nothing is delivered because nothing leaves the process.
        expect(handler).not.toHaveBeenCalled();
    });

    it("gives this process a stable identity for echo suppression", () => {
        expect(INSTANCE_ID).toMatch(/^\d+-[a-z0-9]+$/);
        expect(INSTANCE_ID).toBe(INSTANCE_ID);
    });

    it("can be reset between configurations", async () => {
        const first = getPubSub(undefined);
        await resetPubSub();
        const second = getPubSub(undefined);

        expect(second).not.toBe(first);
    });
});
