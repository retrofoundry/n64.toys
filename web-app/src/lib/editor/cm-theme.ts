import { EditorView } from "@codemirror/view";

export const n64Theme = EditorView.theme(
  {
    "&": {
      color: "var(--color-ink)",
      backgroundColor: "#080908",
      fontSize: "12.5px",
      // Grow with the document up to a cap, then scroll internally — a huge
      // display list must not expand the page forever.
      minHeight: "420px",
      maxHeight: "70vh",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono)",
      lineHeight: "1.55",
      overflow: "auto",
    },
    ".cm-content": { caretColor: "var(--color-n64-yellow)" },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": {
      backgroundColor: "#0b0c0b",
      color: "var(--color-ink-faint)",
      border: "none",
      borderRight: "1px solid var(--color-edge)",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.025)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-ink-dim)" },
    ".cm-cursor": { borderLeftColor: "var(--color-n64-yellow)" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "rgba(22,139,210,0.25)" },
    "&.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(22,139,210,0.35)" },
    ".cm-lintRange-error": {
      textDecoration: "underline wavy var(--color-n64-red)",
      textDecorationSkipInk: "none",
    },
  },
  { dark: true },
);
