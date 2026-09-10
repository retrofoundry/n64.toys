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
import DisplayListInspector from "./DisplayListInspector.svelte";

it("renders the prefix through the stepped-to command", async () => {
  vi.stubGlobal("navigator", { gpu: {} });
  const pg = new Playground();
  render(DisplayListInspector, { pg });
  try {
    await pg.init(document.createElement("canvas"));
    pg.toggleInspection();
    await tick();
    await fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(wasm.render_prefix.mock.lastCall).toEqual([pg.source, 0, [], "F3DEX2", 9]);
    expect(screen.getByText("Rendered through command 8 · G_TRI1 · line 27")).toBeInTheDocument();
    expect(screen.getByText(/Stepping the frame at t = 0.00s · F3DEX2/)).toBeInTheDocument();
  } finally {
    pg.teardown();
    vi.unstubAllGlobals();
  }
});

it("renders to the last command without leaving stepping", async () => {
  const pg = new Playground();
  pg.inspection.open = true;
  pg.inspection.capture(inspectionTrace(205));
  pg.selectCommand(1);
  render(DisplayListInspector, { pg });
  await fireEvent.click(screen.getByRole("button", { name: "Render to end" }));
  expect(pg.inspection.selectedSeq).toBe(204);
  expect(pg.inspection.page).toBe(2);
  expect(pg.inspection.open).toBe(true);
  expect(screen.getByText("Selected command 204 · G_MTX · line 223")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Exit" })).toBeInTheDocument();
});

it("names the last captured command for capped traces and labels unmapped commands", async () => {
  const pg = new Playground();
  const trace = inspectionTrace();
  trace.termination = "cap";
  trace.rows[9].line = null;
  pg.inspection.open = true;
  pg.inspection.capture(trace);
  render(DisplayListInspector, { pg });
  await fireEvent.click(screen.getByRole("button", { name: "Render to last captured command" }));
  expect(pg.inspection.selectedSeq).toBe(9);
  expect(screen.getByText(/last captured command 9 · partial: cap/)).toBeInTheDocument();
  expect(screen.getByText("Selected command 9 · G_MTX · unmapped")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Frame stepping" }).textContent).not.toMatch(/\bend\b/i);
  pg.inspection.invalidate();
  await tick();
  expect(screen.getByRole("button", { name: "Render to last captured command" })).toBeDisabled();
});

it("warns when a prefix was not presented, then clears on successful presentation", async () => {
  vi.stubGlobal("navigator", { gpu: {} });
  const pg = new Playground();
  render(DisplayListInspector, { pg });
  try {
    await pg.init(document.createElement("canvas"));
    pg.toggleInspection();
    await tick();
    wasm.render_prefix.mockReturnValueOnce({ presented: false, diags: [], error: null });
    await fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(pg.inspection.presented).toBe(false);
    expect(screen.getByText("This prefix presented no image. The canvas still shows the previous image.")).toBeInTheDocument();
    expect(screen.getByText("Selected command 8 · G_TRI1 · line 27")).toBeInTheDocument();
    expect(screen.queryByText(/Rendered through command/)).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
    expect(pg.inspection.presented).toBe(true);
    expect(screen.queryByText(/presented no image/)).not.toBeInTheDocument();
    expect(screen.getByText("Rendered through command 9 · G_MTX · line 28")).toBeInTheDocument();
  } finally {
    pg.teardown();
    vi.unstubAllGlobals();
  }
});
