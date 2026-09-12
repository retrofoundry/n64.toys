// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { expect, it, vi } from "vitest";
import { applyBreakpoints, breakpointLines, n64Breakpoints, toggleBreakpoint } from "./breakpoints";

it("toggles breakpoints, moves them with edits, and mirrors external sets without echoing", () => {
  const onChange = vi.fn();
  const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: "a\nb\nc", extensions: [n64Breakpoints(onChange)] }) });
  try {
    view.dispatch({ effects: toggleBreakpoint.of({ pos: view.state.doc.line(2).from, on: true }) });
    expect(breakpointLines(view)).toEqual([2]);
    expect(onChange).toHaveBeenLastCalledWith([2]);
    expect(view.dom.querySelector(".cm-breakpoint-gutter .cm-breakpoint:not(.cm-gutterElement *)") ?? view.dom.querySelector(".cm-breakpoint-gutter .cm-gutterElement .cm-breakpoint")).toHaveAttribute("aria-label", "Breakpoint");
    view.dispatch({ changes: { from: 0, insert: "x\n" } });
    expect(breakpointLines(view)).toEqual([3]);
    expect(onChange).toHaveBeenLastCalledWith([3]);
    view.dispatch({ effects: toggleBreakpoint.of({ pos: view.state.doc.line(3).from, on: false }) });
    expect(breakpointLines(view)).toEqual([]);
    const calls = onChange.mock.calls.length;
    applyBreakpoints(view, [1, 4]);
    expect(breakpointLines(view)).toEqual([1, 4]);
    applyBreakpoints(view, [1, 4]);
    expect(onChange.mock.calls.length).toBe(calls + 1);
    applyBreakpoints(view, [99]);
    expect(breakpointLines(view)).toEqual([]);
  } finally { view.destroy(); }
});
