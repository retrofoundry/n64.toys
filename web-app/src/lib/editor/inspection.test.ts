// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forEachDiagnostic, forceLinting } from "@codemirror/lint";
import { expect, it, vi } from "vitest";
import { inspectLine, inspectionField, n64Inspection } from "./inspection";
import { n64Lint, setDiagsEffect } from "./lint";

it("links and scrolls rows, suppresses cursor echoes, and clears on document changes", () => {
  const cursor = vi.fn();
  const view = new EditorView({ parent:document.body, state:EditorState.create({doc:"first\nsecond\nthird",extensions:[n64Inspection(cursor)]}) });
  try {
    inspectLine(view, 2, true);
    expect(view.state.selection.main.head).toBe(6);
    expect(view.state.field(inspectionField).size).toBe(1);
    expect(view.dom.querySelector(".cm-inspection-line")?.textContent).toBe("second");
    expect(cursor).not.toHaveBeenCalled();
    view.dispatch({selection:{anchor:13}});
    expect(cursor).toHaveBeenCalledWith(3);
    view.dispatch({changes:{from:0,insert:"new\n"}});
    expect(view.state.field(inspectionField).size).toBe(0);
    expect(cursor).toHaveBeenCalledTimes(1);
    inspectLine(view, 999, true);
    expect(view.state.field(inspectionField).size).toBe(0);
  } finally { view.destroy(); }
});
it("coexists with lint and clearing inspection leaves lint intact", async () => {
  const view = new EditorView({parent:document.body,state:EditorState.create({doc:"one\ntwo",extensions:[n64Lint(),n64Inspection(()=>{})]})});
  try {
    view.dispatch({effects:setDiagsEffect.of([{line:2,kind:"src",severity:"warn",msg:"warning"}])});
    forceLinting(view);
    inspectLine(view,2);
    await vi.waitFor(() => {
      const diagnostics: string[] = [];
      forEachDiagnostic(view.state, d=>diagnostics.push(d.message));
      expect(diagnostics).toEqual(["warning"]);
    });
    inspectLine(view,null);
    expect(view.state.field(inspectionField).size).toBe(0);
    const diagnostics: string[] = [];
    forEachDiagnostic(view.state,d=>diagnostics.push(d.message));
    expect(diagnostics).toEqual(["warning"]);
  } finally { view.destroy(); }
});
