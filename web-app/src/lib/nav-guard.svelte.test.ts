import { describe, expect, it, vi } from "vitest";

import { NavGuard } from "./nav-guard.svelte";

describe("NavGuard", () => {
  it("keeps a dirty draft when exit confirmation is cancelled", async () => {
    const intent = vi.fn();
    const confirm = vi.fn(() => false);

    await new NavGuard(() => true, confirm).requestExit(intent);

    expect(confirm).toHaveBeenCalledOnce();
    expect(intent).not.toHaveBeenCalled();
  });

  it("runs the exit intent when a dirty draft is confirmed", async () => {
    const intent = vi.fn();

    await new NavGuard(() => true, () => true).requestExit(intent);

    expect(intent).toHaveBeenCalledOnce();
  });

  it("exits a clean draft without prompting", async () => {
    const intent = vi.fn();
    const confirm = vi.fn(() => false);

    await new NavGuard(() => false, confirm).requestExit(intent);

    expect(confirm).not.toHaveBeenCalled();
    expect(intent).toHaveBeenCalledOnce();
  });

  it("marks beforeunload as handled while the draft is dirty", () => {
    const event = new Event("beforeunload", {
      cancelable: true,
    }) as BeforeUnloadEvent;

    new NavGuard(() => true, () => true).handleBeforeUnload(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
