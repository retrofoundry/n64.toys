<script lang="ts">
  import { onMount } from "svelte";
  import { RefreshCw } from "@lucide/svelte";
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { forceLinting } from "@codemirror/lint";
  import { n64Language, n64Highlighting } from "./editor/n64-lang";
  import { n64Theme } from "./editor/cm-theme";
  import { n64Lint, setDiagsEffect } from "./editor/lint";
  import { n64Inspection, inspectLine } from "./editor/inspection";
  import { applyBreakpoints, n64Breakpoints } from "./editor/breakpoints";
  import type { DebugCommand } from "./playground.svelte";
  import Panel from "./ui/Panel.svelte";
  import HelpDrawer from "./HelpDrawer.svelte";
  import type { Diagnostic } from "./playground.svelte";

  let {
    value = $bindable(),
    diagnostics,
    onrun,
    oninput,
    inspectionLine = null,
    inspectionNavigation = 0,
    breakpoints = [],
    oncursorline = () => {},
    onbreakpoints = () => {},
    ondebug = () => {},
  }: {
    value: string;
    diagnostics: Diagnostic[];
    onrun: () => void;
    oninput?: () => void;
    inspectionLine?: number | null;
    inspectionNavigation?: number;
    breakpoints?: number[];
    oncursorline?: (line: number) => void;
    onbreakpoints?: (lines: number[]) => void;
    ondebug?: (command: DebugCommand) => void;
  } = $props();

  let host: HTMLDivElement;
  let view = $state.raw<EditorView | undefined>();
  let lastNavigation = 0;
  let helpOpen = $state(false);
  let helpTrigger = $state<HTMLButtonElement | undefined>();

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          n64Breakpoints(lines => onbreakpoints(lines)),
          lineNumbers(),
          history(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          n64Language(),
          n64Highlighting,
          n64Theme,
          n64Lint(),
          n64Inspection(line => oncursorline(line)),
          keymap.of([
            { key: "Mod-Enter", preventDefault: true, run: () => { onrun(); return true; } },
            { key: "F5", preventDefault: true, run: () => { ondebug("continue"); return true; } },
            { key: "Shift-F5", preventDefault: true, run: () => { ondebug("stop"); return true; } },
            { key: "F10", preventDefault: true, run: () => { ondebug("over"); return true; } },
            { key: "F11", preventDefault: true, run: () => { ondebug("into"); return true; } },
            { key: "Shift-F11", preventDefault: true, run: () => { ondebug("out"); return true; } },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              value = u.state.doc.toString();
              oninput?.();
            }
          }),
        ],
      }),
    });
    applyBreakpoints(view, breakpoints);
    return () => view?.destroy();
  });

  $effect(() => {
    const lines = breakpoints;
    if (view) applyBreakpoints(view, lines);
  });

  $effect(() => {
    const line = inspectionLine;
    const navigation = inspectionNavigation;
    if (view) inspectLine(view, line, navigation !== lastNavigation);
    lastNavigation = navigation;
  });

  // Push external value changes into the editor.
  $effect(() => {
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  });

  // Re-lint when diagnostics change. (First run is pre-mount and no-ops; diags start empty.)
  $effect(() => {
    const d = diagnostics;
    if (view) {
      view.dispatch({ effects: setDiagsEffect.of(d) });
      forceLinting(view);
    }
  });
</script>

{#snippet actions()}
  <span class="ui-status text-ink-faint">⌘↵ run</span>
  <button
    type="button"
    bind:this={helpTrigger}
    aria-label="help"
    aria-expanded={helpOpen}
    title="How to write toys"
    onclick={() => (helpOpen = !helpOpen)}
    class="ui-button flex items-center justify-center px-2 py-[0.2rem] text-[11px] leading-none"
  >?</button>
{/snippet}

<Panel title="source · gbi macros" {actions} class="flex flex-col" bodyClass="flex flex-1 flex-col">
  <div bind:this={host} class="min-h-0 flex-1 overflow-hidden"></div>
  <div class="flex items-center gap-3 px-3.5 py-2.5 border-t border-edge">
    <button
      type="button"
      onclick={onrun}
      title="Re-run now (⌘↵)"
      class="ui-button ui-button-primary flex min-h-8 items-center justify-center gap-1.5"
    ><RefreshCw size={13} strokeWidth={2.2} /> Run</button>
    <span class="ml-auto text-[11px] text-ink-faint">edits apply as you type</span>
  </div>
</Panel>

<HelpDrawer bind:open={helpOpen} returnFocus={helpTrigger} />
