// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Viewport from "./Viewport.svelte";

const basePg = {
  settings: { microcode: "F3DEX2" },
  status: "ready",
  errored: false,
  isAnimated: false,
  rendererState: "ready",
  hasRenderer: true,
};

describe("Viewport", () => {
  it("labels the viewport region and render output", () => {
    render(Viewport, { pg: basePg as never });
    expect(screen.getByRole("region", { name: "viewport" })).toBeInTheDocument();
    expect(screen.getByLabelText("N64 render output")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("shows the unsupported card instead of a dead canvas", () => {
    const pg = { ...basePg, rendererState: "unsupported", hasRenderer: false };
    render(Viewport, { pg: pg as never });
    expect(screen.getAllByText(/WebGPU/).length).toBeGreaterThan(0);
    expect(screen.getByText(/doesn't support it yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browser support/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("N64 render output")).not.toBeInTheDocument();
  });

  it("shows retry on renderer failure and calls retryRenderer", async () => {
    const retryRenderer = vi.fn();
    const pg = {
      ...basePg,
      rendererState: "failed",
      rendererError: "no adapter",
      hasRenderer: false,
      retryRenderer,
    };
    render(Viewport, { pg: pg as never });
    await fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retryRenderer).toHaveBeenCalled();
  });
});
