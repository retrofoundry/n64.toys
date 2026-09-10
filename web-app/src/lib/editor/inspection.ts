import { Annotation, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter, type DecorationSet, type ViewUpdate } from "@codemirror/view";

export const inspectionNavigation = Annotation.define<boolean>();
export const setInspectionLine = StateEffect.define<number | null>();
export const inspectionField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged) return Decoration.none;
    for (const effect of transaction.effects) {
      if (effect.is(setInspectionLine)) {
        const line = effect.value;
        if (line === null || line < 1 || line > transaction.state.doc.lines) return Decoration.none;
        return Decoration.set([Decoration.line({ class: "cm-inspection-line" }).range(transaction.state.doc.line(line).from)]);
      }
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
class ExecutionMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.textContent = "→";
    marker.className = "inspection-marker";
    marker.setAttribute("aria-label", "Rendered through this line");
    marker.title = "Rendered through this line";
    return marker;
  }
}
const executionMarker = new ExecutionMarker();
const inspectionGutter = gutter({
  class: "cm-inspection-gutter",
  lineMarker(view, line) {
    let current = false;
    view.state.field(inspectionField).between(line.from, line.from, () => { current = true; });
    return current ? executionMarker : null;
  },
  lineMarkerChange: update => update.startState.field(inspectionField) !== update.state.field(inspectionField),
});

export function inspectLine(view: EditorView, line: number | null, navigate = false): void {
  const valid = line !== null && line >= 1 && line <= view.state.doc.lines;
  const effects = [setInspectionLine.of(valid ? line : null)];
  if (valid && navigate) {
    const anchor = view.state.doc.line(line).from;
    view.dispatch({ effects, selection: { anchor }, annotations: inspectionNavigation.of(true) });
    // Scroll the editor's own scroller: CodeMirror's scrollIntoView also scrolls the page.
    const block = view.lineBlockAt(anchor);
    const scroller = view.scrollDOM;
    if (block.top < scroller.scrollTop || block.bottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = Math.max(0, (block.top + block.bottom - scroller.clientHeight) / 2);
    }
  } else view.dispatch({ effects });
}
export function cursorLineChanged(update: ViewUpdate, callback: (line: number) => void): void {
  if (update.docChanged || !update.selectionSet || update.transactions.some(tr => tr.annotation(inspectionNavigation))) return;
  callback(update.state.doc.lineAt(update.state.selection.main.head).number);
}
export function n64Inspection(onCursorLine: (line: number) => void): Extension {
  return [inspectionField, inspectionGutter, EditorView.updateListener.of(update => cursorLineChanged(update, onCursorLine))];
}
