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
  import Panel from "./ui/Panel.svelte";
  import type { Diagnostic } from "./playground.svelte";

  let {
    value = $bindable(),
    diagnostics,
    onrun,
    oninput,
    autoRun = $bindable(false),
  }: {
    value: string;
    diagnostics: Diagnostic[];
    onrun: () => void;
    oninput?: () => void;
    autoRun?: boolean;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          n64Language(),
          n64Highlighting,
          n64Theme,
          n64Lint(),
          keymap.of([
            { key: "Mod-Enter", preventDefault: true, run: () => { onrun(); return true; } },
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
    return () => view?.destroy();
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
{/snippet}

<Panel title="source · gbi macros" {actions} class="flex flex-col" bodyClass="flex flex-1 flex-col">
  <div bind:this={host} class="min-h-0 flex-1 overflow-hidden"></div>
  <div class="flex items-center gap-3 px-3.5 py-2.5 border-t border-edge">
    <button
      type="button"
      onclick={onrun}
      disabled={autoRun}
      class="ui-button ui-button-primary flex min-h-8 items-center justify-center gap-1.5"
    ><RefreshCw size={13} strokeWidth={2.2} /> Run</button>
    <button
      type="button"
      aria-pressed={autoRun}
      onclick={() => (autoRun = !autoRun)}
      title={autoRun ? "Hot reload on — re-runs on every edit" : "Hot reload off — press Run to apply edits"}
      class="ui-button ml-auto flex min-h-8 items-center justify-center"
    >
      <span class={autoRun ? "text-n64-yellow" : "text-ink-dim"}>hot reload {autoRun ? "on" : "off"}</span>
    </button>
  </div>
</Panel>
