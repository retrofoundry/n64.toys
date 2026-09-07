// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import { tick } from "svelte";
import { inspectionTrace } from "./test/inspection";

const wasm = vi.hoisted(() => ({
  render: vi.fn(() => ({ presented: true, diags: [], error: null })),
  render_prefix: vi.fn(() => ({ presented: true, diags: [], error: null })),
  shutdown: vi.fn(),
}));
vi.mock("../wasm/n64_toys.js", () => ({
  default: vi.fn(async () => undefined),
  Renderer: { init: vi.fn(async () => wasm) },
  analyze: vi.fn(() => ({ textures: [], references_time: false, diags: [] })),
  inspect: vi.fn(() => inspectionTrace()),
}));

import { Playground } from "./playground.svelte";
import StepDock from "./StepDock.svelte";

it("shows the dock only while stepping and preserves the canvas across two round trips", async () => {
  vi.stubGlobal("navigator", { gpu: {} });
  const pg = new Playground();
  const home = document.createElement("div");
  document.body.appendChild(home);
  const { unmount } = render(StepDock, { pg, viewportHome: home });
  try {
    const canvas = screen.getByLabelText<HTMLCanvasElement>("N64 render output");
    await pg.init(canvas);
    expect(home).toContainElement(canvas);
    expect(screen.queryByRole("region", { name: "Frame stepping" })).not.toBeInTheDocument();
    for (let i = 0; i < 2; i++) {
      pg.toggleInspection();
      await tick();
      expect(screen.getByRole("region", { name: "Frame stepping" })).toContainElement(canvas);
      expect(screen.getByLabelText("N64 render output")).toBe(canvas);
      await fireEvent.click(screen.getByRole("button", { name: "Step back" }));
      expect(wasm.render_prefix.mock.lastCall).toEqual([pg.source, 0, [], "F3DEX2", 9]);
      expect(screen.getByText("Rendered through command 8 · G_TRI1 · line 27")).toBeInTheDocument();
      pg.toggleInspection();
      await tick();
      expect(home).toContainElement(canvas);
      expect(screen.queryByRole("region", { name: "Frame stepping" })).not.toBeInTheDocument();
    }
  } finally {
    unmount();
    pg.teardown();
    home.remove();
    vi.unstubAllGlobals();
  }
});

it("renders to the last command without closing the dock", async () => {
  const pg = new Playground();
  pg.inspection.open = true;
  pg.inspection.capture(inspectionTrace(205));
  pg.selectCommand(1);
  render(StepDock, { pg });
  await fireEvent.click(screen.getByRole("button", { name: "Render to end" }));
  expect(pg.inspection.selectedSeq).toBe(204);
  expect(pg.inspection.page).toBe(2);
  expect(pg.inspection.open).toBe(true);
  expect(screen.getByText("Rendered through command 204 · G_MTX · line 223")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Step through frame" })).toHaveAttribute("aria-pressed", "true");
});

it("names the last captured command for capped traces and labels unmapped commands", async () => {
  const pg = new Playground();
  const trace = inspectionTrace();
  trace.termination = "cap";
  trace.rows[9].line = null;
  pg.inspection.open = true;
  pg.inspection.capture(trace);
  render(StepDock, { pg });
  await fireEvent.click(screen.getByRole("button", { name: "Render to last captured command" }));
  expect(pg.inspection.selectedSeq).toBe(9);
  expect(screen.getByText("Last captured command 9 · partial: cap")).toBeInTheDocument();
  expect(screen.getByText("Rendered through command 9 · G_MTX · unmapped")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Frame stepping" }).textContent).not.toMatch(/\bend\b/i);
  pg.inspection.invalidate();
  await tick();
  expect(screen.getByRole("button", { name: "Render to last captured command" })).toBeDisabled();
});
