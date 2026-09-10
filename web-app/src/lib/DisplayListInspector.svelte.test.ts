// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import { tick } from "svelte";
import { Playground } from "./playground.svelte";
import DisplayListInspector from "./DisplayListInspector.svelte";
import PlayerBar from "./PlayerBar.svelte";
import { inspectionTrace } from "./test/inspection";

it("starts collapsed and has a toggle even for static toys", async () => {
  const pg = new Playground();
  render(PlayerBar, {pg});
  expect(screen.queryByRole("button", {name:"Step forward"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name:"Play"})).not.toBeInTheDocument();
  const toggle = screen.getByRole("button", {name:"Step through frame"});
  await fireEvent.click(toggle);
  expect(pg.inspection.open).toBe(true);
  expect(toggle).toHaveAttribute("aria-pressed","true");
  render(DisplayListInspector, {pg});
  expect(screen.getByRole("group", {name:"Frame stepping"})).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", {name:"Exit"}));
  expect(pg.inspection.trace).toBeNull();
  expect(toggle).toHaveAttribute("aria-pressed","false");
});

it("keeps the player bar in place while stepping but freezes its time controls", async () => {
  vi.spyOn(Playground.prototype, "hasRenderer", "get").mockReturnValue(true);
  const pg = new Playground();
  pg.isAnimated = true;
  render(PlayerBar, {pg});
  expect(screen.getByRole("slider", {name:"Time"})).toBeEnabled();
  pg.inspection.open = true;
  await tick();
  expect(screen.getByRole("button", {name:"Step through frame"})).toHaveAttribute("aria-pressed","true");
  expect(screen.getByRole("slider", {name:"Time"})).toBeDisabled();
  expect(screen.getByRole("button", {name:"Play"})).toBeDisabled();
  expect(screen.getByRole("button", {name:"Reset"})).toBeDisabled();
});

it("pages commands, selects with arrows, links repeated rows and expands raw continuations", async () => {
  const pg = new Playground();
  const trace = inspectionTrace(205);
  trace.rows[101].line = 20;
  trace.rows[101].pc = trace.rows[1].pc;
  trace.rows[8].words.push({...trace.rows[8].words[0],pc:"0x00000200"});
  pg.inspection.open = true;
  pg.inspection.capture(trace);
  render(DisplayListInspector, {pg});
  expect(screen.getAllByRole("button", {name:/^Command /})).toHaveLength(100);
  await fireEvent.click(screen.getByRole("button", {name:"Next page"}));
  expect(screen.getByText("Page 2 / 3")).toBeInTheDocument();
  const row = screen.getByRole("button", {name:"Command 101, G_MTX, line 20"});
  await fireEvent.click(row);
  expect(row).toHaveAttribute("aria-pressed","true");
  expect(row.querySelector(".inspection-marker")).toHaveTextContent("→");
  expect(row.querySelector(".inspection-marker")).toHaveAttribute("aria-label", "Rendered through");
  expect(screen.getByText("State after command 101")).toBeInTheDocument();
  await fireEvent.keyDown(row, {key:"ArrowUp"});
  expect(pg.inspection.selectedSeq).toBe(100);
  await fireEvent.keyDown(screen.getByRole("button", {name:"Command 100, G_MTX, line 119"}), {key:"ArrowUp"});
  expect(pg.inspection.selectedSeq).toBe(99);
  expect(screen.getByText("Page 1 / 3")).toBeInTheDocument();
  pg.inspectSourceLine(20);
  await vi.waitFor(() => expect(screen.getByRole("button", {name:"Command 1, G_MTX, line 20"})).toHaveClass("source-match"));
  expect(pg.inspection.selectedSeq).toBe(99);
  expect(screen.getByRole("button", {name:"Command 99, G_MTX, line 118"})).toHaveAttribute("aria-pressed", "true");
  await fireEvent.click(screen.getByRole("button", {name:"Next page"}));
  expect(screen.getByRole("button", {name:"Command 101, G_MTX, line 20"})).toHaveClass("source-match");
  pg.selectCommand(8);
  await vi.waitFor(() => expect(screen.getByText("run 3, op none, material 1, render mode 0")).toBeInTheDocument());
  const words = screen.getByText("Words for 8 · 1 continuation(s)");
  await fireEvent.click(words);
  expect(words.closest("details")).toHaveAttribute("open");
  expect(screen.getByText(/0x00000200: 0x05000000/)).toBeInTheDocument();
});

it("shows partial traces, emissions and terminal diagnostics, and disables stale stepping", async () => {
  const pg = new Playground();
  const trace = inspectionTrace();
  trace.termination = "cap";
  trace.diags = [{line:27,kind:"src",severity:"warn",msg:"missing render mode",seq:null,pc:trace.rows[8].pc}];
  trace.rows[8].draws = [{kind:"texRect",target:{pairIndex:1,colorImage:{fmt:0,siz:2,width:64,addr:"0x00100000"},depthImage:null,isDepthClear:false},opIndex:0,rect:[0,0,256,256],tile:3,uls:0,ult:0,dsdx:1024,dtdy:1024,flip:false,copyMode:true,fbSource:"0x00200000"}];
  pg.inspection.open = true;
  pg.inspection.capture(trace);
  render(DisplayListInspector, {pg});
  await fireEvent.click(screen.getByRole("button", {name:"Next draw"}));
  expect(screen.getByText(/partial: cap/)).toBeInTheDocument();
  expect(screen.getByText(/Terminal diagnostic: missing render mode/)).toBeInTheDocument();
  expect(screen.getByText(/Framebuffer source: 0x00200000/)).toBeInTheDocument();
  expect(screen.getByText(/Explicit tile 3/)).toBeInTheDocument();
  pg.inspection.invalidate();
  await vi.waitFor(() => expect(screen.getByRole("button", {name:"Step forward"})).toBeDisabled());
  expect(screen.getByRole("button", {name:"Command 8, G_TRI1, line 27"})).toBeDisabled();
  pg.stepCommand(-1);
  expect(pg.inspection.selectedSeq).toBe(8);
});
