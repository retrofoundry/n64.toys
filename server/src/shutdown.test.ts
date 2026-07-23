import { describe, expect, it } from "vitest";

import {
  registerShutdown,
  type ShutdownDependencies,
  type ShutdownSignal,
} from "./shutdown.js";

describe("registerShutdown", () => {
  it("ignores a repeated SIGINT until ordered cleanup completes", async () => {
    const events: string[] = [];
    const listeners = new Map<ShutdownSignal, () => void>();
    let finishServerClose: ((error?: Error) => void) | undefined;
    let finishPoolClose: (() => void) | undefined;
    const poolClose = new Promise<void>((resolve) => {
      finishPoolClose = resolve;
    });
    let finishExit: ((code: number) => void) | undefined;
    const exit = new Promise<number>((resolve) => {
      finishExit = resolve;
    });
    let serverCloseCount = 0;
    let poolCloseCount = 0;

    const dependencies: ShutdownDependencies = {
      closeServer: (onClose) => {
        serverCloseCount += 1;
        events.push("server.close");
        finishServerClose = onClose;
      },
      closePool: () => {
        poolCloseCount += 1;
        events.push("pool.end");
        return poolClose;
      },
      onSignal: (signal, listener) => listeners.set(signal, listener),
      removeSignalListener: (signal, listener) => {
        expect(listeners.get(signal)).toBe(listener);
        listeners.delete(signal);
        events.push(`remove:${signal}`);
      },
      exit: (code) => {
        events.push(`exit:${code}`);
        finishExit?.(code);
      },
      logError: () => undefined,
    };
    registerShutdown(dependencies);

    listeners.get("SIGINT")?.();
    finishServerClose?.();
    listeners.get("SIGINT")?.();

    expect(serverCloseCount).toBe(1);
    expect(poolCloseCount).toBe(1);
    expect(events).toEqual(["server.close", "pool.end"]);

    finishPoolClose?.();
    await expect(exit).resolves.toBe(0);

    expect(listeners.size).toBe(0);
    expect(events).toEqual([
      "server.close",
      "pool.end",
      "remove:SIGINT",
      "remove:SIGTERM",
      "exit:0",
    ]);
  });

  it.each(["server", "pool"] as const)(
    "exits nonzero after a %s close failure",
    async (failure) => {
      const closeError = new Error(`${failure} close failed`);
      const listeners = new Map<ShutdownSignal, () => void>();
      const removed: ShutdownSignal[] = [];
      const logged: unknown[] = [];
      let finishServerClose: ((error?: Error) => void) | undefined;
      let finishExit: ((code: number) => void) | undefined;
      const exit = new Promise<number>((resolve) => {
        finishExit = resolve;
      });

      registerShutdown({
        closeServer: (onClose) => {
          finishServerClose = onClose;
        },
        closePool: () =>
          failure === "pool" ? Promise.reject(closeError) : Promise.resolve(),
        onSignal: (signal, listener) => listeners.set(signal, listener),
        removeSignalListener: (signal) => {
          listeners.delete(signal);
          removed.push(signal);
        },
        exit: (code) => finishExit?.(code),
        logError: (error) => logged.push(error),
      });

      listeners.get("SIGTERM")?.();
      finishServerClose?.(failure === "server" ? closeError : undefined);

      await expect(exit).resolves.toBe(1);
      expect(logged).toEqual([closeError]);
      expect(removed).toEqual(["SIGINT", "SIGTERM"]);
      expect(listeners.size).toBe(0);
    },
  );
});
