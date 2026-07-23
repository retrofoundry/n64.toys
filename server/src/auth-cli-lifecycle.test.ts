import { describe, expect, it, vi } from "vitest";

import { composeCliAuth } from "./auth-cli-lifecycle.js";

describe("composeCliAuth", () => {
  it("awaits pool closure exactly once without process event hooks", async () => {
    const events: string[] = [];
    let finishClosing: (() => void) | undefined;
    const end = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          events.push("close:start");
          finishClosing = resolve;
        }),
    );
    const processOnce = vi.spyOn(process, "once");

    const composing = composeCliAuth(
      { databaseUrl: "postgresql://example.test/auth" },
      {
        createDatabase: () => ({ db: "database", pool: { end } }),
        createAuth: (_config, db) => {
          events.push(`auth:${db}`);
          return "auth";
        },
      },
    );
    let settled = false;
    void composing.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(events).toEqual(["auth:database", "close:start"]);
    expect(settled).toBe(false);
    expect(end).toHaveBeenCalledTimes(1);
    expect(processOnce).not.toHaveBeenCalled();

    finishClosing?.();
    await expect(composing).resolves.toBe("auth");

    processOnce.mockRestore();
  });
});
