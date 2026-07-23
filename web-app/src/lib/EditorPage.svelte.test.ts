// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Playground } from "./playground.svelte";

const components = vi.hoisted(() => ({
  editorProps: undefined as { oninput?: () => void } | undefined,
}));

function marker(testId: string) {
  return (anchor: Node) => {
    const element = document.createElement("section");
    element.dataset.testid = testId;
    anchor.parentNode?.insertBefore(element, anchor);
  };
}

function editorMarker(anchor: Node, props: { oninput?: () => void }) {
  components.editorProps = props;
  return marker("source")(anchor);
}

vi.mock("./Viewport.svelte", () => ({ default: marker("viewport") }));
vi.mock("./Editor.svelte", () => ({ default: editorMarker }));
vi.mock("./ToyMeta.svelte", () => ({ default: marker("meta") }));
vi.mock("./TextureInputs.svelte", () => ({ default: marker("textures") }));
vi.mock("./Diagnostics.svelte", () => ({ default: marker("diagnostics") }));
vi.mock("./Settings.svelte", () => ({ default: marker("settings") }));
vi.mock("./SaveControls.svelte", () => ({ default: marker("save-controls") }));

import EditorPage from "./EditorPage.svelte";

const saveController = {
  status: "idle",
  visibility: "private",
  save: vi.fn(),
  setVisibility: vi.fn(),
  discardPendingDraft: vi.fn(),
} as never;

describe("EditorPage", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/#new");
    components.editorProps = undefined;
  });

  it("keeps the functional mobile order in the DOM", () => {
    render(EditorPage, { pg: new Playground(), saveController });
    expect(
      screen.getAllByTestId(
        /viewport|source|meta|save-controls|textures|diagnostics|settings/,
      ),
    ).toEqual([
      screen.getByTestId("viewport"),
      screen.getByTestId("source"),
      screen.getByTestId("meta"),
      screen.getByTestId("save-controls"),
      screen.getByTestId("textures"),
      screen.getByTestId("diagnostics"),
      screen.getByTestId("settings"),
    ]);
  });

  it("returns to browse", async () => {
    const onexit = vi.fn();
    render(EditorPage, { pg: new Playground(), saveController, onexit });
    await fireEvent.click(screen.getByRole("button", { name: "browse" }));
    expect(onexit).toHaveBeenCalledOnce();
    expect(location.hash).toBe("#new");
  });

  it("reconciles source declarations before scheduling auto-run", () => {
    const pg = new Playground();
    const calls: string[] = [];
    vi.spyOn(pg, "reconcileTextureDeclarations").mockImplementation(() =>
      calls.push("reconcile"),
    );
    vi.spyOn(pg, "scheduleAutoRun").mockImplementation(() =>
      calls.push("schedule"),
    );
    render(EditorPage, { pg, saveController });

    components.editorProps?.oninput?.();

    expect(calls).toEqual(["reconcile", "schedule"]);
  });
});
