// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forEachDiagnostic, forceLinting } from "@codemirror/lint";
import { expect, it, vi } from "vitest";
import { n64Lint, setDiagsEffect } from "./lint";

it("maps source warning and error severities and omits address diagnostics", async () => {
  const view = new EditorView({
    state: EditorState.create({
      doc: "first\nsecond",
      extensions: [n64Lint()],
    }),
    parent: document.body,
  });
  try {
    view.dispatch({
      effects: setDiagsEffect.of([
        { line: 1, kind: "src", severity: "warn", msg: "warning" },
        { line: 2, kind: "src", severity: "error", msg: "failure" },
        { line: 32, kind: "addr", severity: "error", msg: "address" },
      ]),
    });
    forceLinting(view);
    await vi.waitFor(() => {
      const diagnostics: { severity: string; message: string }[] = [];
      forEachDiagnostic(view.state, (diag) => diagnostics.push(diag));
      expect(
        diagnostics.map(({ severity, message }) => ({ severity, message })),
      ).toEqual([
        { severity: "warning", message: "warning" },
        { severity: "error", message: "failure" },
      ]);
    });
  } finally {
    view.destroy();
  }
});
