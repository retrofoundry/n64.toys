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
import DebugBar from "./DebugBar.svelte";

function subListTrace() {
  const trace = inspectionTrace(10);
  Object.assign(trace.rows[5], { line: 22, flow: "call", depthBefore: 0, depthAfter: 1 });
  Object.assign(trace.rows[6], { line: 40, depthBefore: 1, depthAfter: 1 });
  Object.assign(trace.rows[7], { line: 41, depthBefore: 1, depthAfter: 1 });
  Object.assign(trace.rows[8], { line: 42, flow: "return", depthBefore: 1, depthAfter: 0 });
  trace.rows[9].line = 23;
  return trace;
}

it("stops at the first breakpoint on open and renders the prefix through each step", async () => {
  vi.stubGlobal("navigator", { gpu: {} });
  const pg = new Playground();
  pg.setBreakpoints([27]);
  render(DebugBar, { pg });
  try {
    await pg.init(document.createElement("canvas"));
    pg.toggleInspection();
    await tick();
    expect(wasm.render_prefix.mock.lastCall).toEqual([pg.source, 0, [], "F3DEX2", 9]);
    expect(screen.getByText(/Rendered through command 8 · G_TRI1 · line 27/)).toBeInTheDocument();
    expect(pg.inspection.linkedLine).toBe(27);
    await fireEvent.click(screen.getByRole("button", { name: "Step over" }));
    expect(wasm.render_prefix.mock.lastCall).toEqual([pg.source, 0, [], "F3DEX2", 10]);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(screen.getByText(/Rendered through command 8/)).toBeInTheDocument();
  } finally {
    pg.teardown();
    vi.unstubAllGlobals();
  }
});

it("continues between breakpoints, to the end, backwards to the start, and restarts", async () => {
  const pg = new Playground();
  pg.inspection.open = true;
  pg.inspection.capture(inspectionTrace());
  pg.setBreakpoints([21, 24]);
  pg.restartFrame();
  render(DebugBar, { pg });
  expect(pg.inspection.selectedSeq).toBe(2);
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(pg.inspection.selectedSeq).toBe(5);
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(pg.inspection.selectedSeq).toBe(9);
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  await fireEvent.click(screen.getByRole("button", { name: "Reverse continue" }));
  expect(pg.inspection.selectedSeq).toBe(5);
  await fireEvent.click(screen.getByRole("button", { name: "Reverse continue" }));
  expect(pg.inspection.selectedSeq).toBe(2);
  await fireEvent.click(screen.getByRole("button", { name: "Reverse continue" }));
  expect(pg.inspection.selectedSeq).toBe(0);
  expect(screen.getByRole("button", { name: "Reverse continue" })).toBeDisabled();
  await fireEvent.click(screen.getByRole("button", { name: "Restart" }));
  expect(pg.inspection.selectedSeq).toBe(2);
  expect(screen.getByText("Selected command 2 · G_MTX · line 21 · t = 0.00s")).toBeInTheDocument();
  expect(pg.inspection.open).toBe(true);
});

it("steps over, into and out of a sub-list", async () => {
  const pg = new Playground();
  pg.inspection.open = true;
  pg.inspection.capture(subListTrace());
  pg.selectCommand(4);
  render(DebugBar, { pg });
  await fireEvent.click(screen.getByRole("button", { name: "Step over" }));
  expect(pg.inspection.selectedSeq).toBe(5);
  expect(screen.getByRole("button", { name: "Step out" })).toBeDisabled();
  await fireEvent.click(screen.getByRole("button", { name: "Step over" }));
  expect(pg.inspection.selectedSeq).toBe(9);
  await fireEvent.click(screen.getByRole("button", { name: "Step back" }));
  expect(pg.inspection.selectedSeq).toBe(5);
  await fireEvent.click(screen.getByRole("button", { name: "Step into" }));
  expect(pg.inspection.selectedSeq).toBe(6);
  await fireEvent.click(screen.getByRole("button", { name: "Step out" }));
  expect(pg.inspection.selectedSeq).toBe(8);
  expect(screen.getByRole("button", { name: "Step over" })).toBeEnabled();
});

it("drives the same verbs from editor keys and starts a session from an idle one", async () => {
  const pg = new Playground();
  pg.debugCommand("stop");
  expect(pg.inspection.open).toBe(false);
  pg.debugCommand("over");
  expect(pg.inspection.open).toBe(true);
  pg.inspection.capture(subListTrace());
  pg.selectCommand(5);
  pg.debugCommand("into");
  expect(pg.inspection.selectedSeq).toBe(6);
  pg.debugCommand("out");
  expect(pg.inspection.selectedSeq).toBe(8);
  pg.debugCommand("continue");
  expect(pg.inspection.selectedSeq).toBe(9);
  pg.debugCommand("stop");
  expect(pg.inspection.open).toBe(false);
});

it("names the last captured command for capped traces and labels unmapped commands", async () => {
  const pg = new Playground();
  const trace = inspectionTrace();
  trace.termination = "cap";
  trace.rows[9].line = null;
  pg.inspection.open = true;
  pg.inspection.capture(trace);
  render(DebugBar, { pg });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(pg.inspection.selectedSeq).toBe(9);
  expect(screen.getByText(/Selected command 9 · G_MTX · unmapped/)).toBeInTheDocument();
  expect(screen.getByRole("toolbar", { name: "Debug frame" }).textContent).not.toMatch(/\bend\b/i);
  pg.inspection.invalidate();
  await tick();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  expect(screen.getByText(/Stale trace/)).toBeInTheDocument();
});

it("warns when a prefix was not presented, then clears on successful presentation", async () => {
  vi.stubGlobal("navigator", { gpu: {} });
  const pg = new Playground();
  render(DebugBar, { pg });
  try {
    await pg.init(document.createElement("canvas"));
    pg.toggleInspection();
    await tick();
    wasm.render_prefix.mockReturnValueOnce({ presented: false, diags: [], error: null });
    await fireEvent.click(screen.getByRole("button", { name: "Step back" }));
    expect(pg.inspection.presented).toBe(false);
    expect(screen.getByText("This prefix presented no image. The canvas still shows the previous image.")).toBeInTheDocument();
    expect(screen.getByText(/Selected command 8 · G_TRI1 · line 27/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Next command" }));
    expect(pg.inspection.presented).toBe(true);
    expect(screen.queryByText(/presented no image/)).not.toBeInTheDocument();
    expect(screen.getByText(/Rendered through command 9 · G_MTX · line 28/)).toBeInTheDocument();
  } finally {
    pg.teardown();
    vi.unstubAllGlobals();
  }
});
