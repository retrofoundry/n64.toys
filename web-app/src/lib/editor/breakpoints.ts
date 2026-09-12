import { RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";

class BreakpointMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = "cm-breakpoint";
    marker.setAttribute("aria-label", "Breakpoint");
    marker.title = "Breakpoint";
    return marker;
  }
}
const breakpointMarker = new BreakpointMarker();
export const toggleBreakpoint = StateEffect.define<{ pos: number; on: boolean }>();
export const setBreakpoints = StateEffect.define<number[]>();
export const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, transaction) {
    set = set.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(toggleBreakpoint)) {
        set = effect.value.on
          ? set.update({ add: [breakpointMarker.range(effect.value.pos)] })
          : set.update({ filter: from => from !== effect.value.pos });
      } else if (effect.is(setBreakpoints)) {
        const doc = transaction.state.doc;
        const lines = [...new Set(effect.value)].filter(line => line >= 1 && line <= doc.lines).sort((a, b) => a - b);
        set = RangeSet.of(lines.map(line => breakpointMarker.range(doc.line(line).from)));
      }
    }
    return set;
  },
});
export function breakpointLines(view: EditorView): number[] {
  const lines: number[] = [];
  const cursor = view.state.field(breakpointField).iter();
  while (cursor.value) {
    lines.push(view.state.doc.lineAt(cursor.from).number);
    cursor.next();
  }
  return lines;
}
export function applyBreakpoints(view: EditorView, lines: number[]): void {
  const current = breakpointLines(view);
  if (current.length === lines.length && current.every((line, i) => line === lines[i])) return;
  view.dispatch({ effects: setBreakpoints.of(lines) });
}
export function n64Breakpoints(onChange: (lines: number[]) => void): Extension {
  return [
    breakpointField,
    gutter({
      class: "cm-breakpoint-gutter",
      markers: view => view.state.field(breakpointField),
      initialSpacer: () => breakpointMarker,
      domEventHandlers: {
        mousedown(view, line) {
          let on = true;
          view.state.field(breakpointField).between(line.from, line.from, () => { on = false; });
          view.dispatch({ effects: toggleBreakpoint.of({ pos: line.from, on }) });
          return true;
        },
      },
    }),
    EditorView.updateListener.of(update => {
      if (update.startState.field(breakpointField) !== update.state.field(breakpointField)) onChange(breakpointLines(update.view));
    }),
  ];
}
