// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";
import { Playground } from "./playground.svelte";

const components = vi.hoisted(() => ({
  editorProps: undefined as { oninput?: () => void } | undefined,
}));

vi.mock("./DisplayListInspector.svelte", async () => ({ default: (await import("./test/marker")).marker("inspector") }));
vi.mock("./Viewport.svelte", async () => ({ default: (await import("./test/marker")).marker("viewport") }));
vi.mock("./Editor.svelte", async () => ({
  default: (await import("./test/marker")).marker("source", props => (components.editorProps = props)),
}));
vi.mock("./ToyMeta.svelte", async () => ({ default: (await import("./test/marker")).marker("meta") }));
vi.mock("./TextureInputs.svelte", async () => ({ default: (await import("./test/marker")).marker("textures") }));
vi.mock("./Diagnostics.svelte", async () => ({ default: (await import("./test/marker")).marker("diagnostics") }));
vi.mock("./Settings.svelte", async () => ({ default: (await import("./test/marker")).marker("settings") }));
vi.mock("./SaveControls.svelte", async () => ({ default: (await import("./test/marker")).marker("save-controls") }));

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
        /viewport|inspector|source|meta|save-controls|textures|diagnostics|settings/,
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

  it("swaps the source column for the stepping panel and leaves the viewport in place", async () => {
    const pg = new Playground();
    render(EditorPage, { pg, saveController });
    expect(screen.getByTestId("source")).toBeInTheDocument();
    expect(screen.queryByTestId("inspector")).not.toBeInTheDocument();
    const viewportBefore = screen.getByTestId("viewport").parentElement;

    pg.toggleInspection();
    await tick();
    expect(screen.getByTestId("inspector").parentElement).toHaveClass("editor-source");
    expect(screen.queryByTestId("source")).not.toBeInTheDocument();
    expect(screen.getByTestId("viewport").parentElement).toBe(viewportBefore);

    pg.toggleInspection();
    await tick();
    expect(screen.getByTestId("source")).toBeInTheDocument();
    expect(screen.queryByTestId("inspector")).not.toBeInTheDocument();
  });

  it("returns to browse", async () => {
    const onexit = vi.fn();
    render(EditorPage, { pg: new Playground(), saveController, onexit });
    await fireEvent.click(screen.getByRole("button", { name: "browse" }));
    expect(onexit).toHaveBeenCalledOnce();
    expect(location.hash).toBe("#new");
  });

  it("schedules a re-run without explicitly reconciling source declarations", () => {
    const pg = new Playground();
    const calls: string[] = [];
    vi.spyOn(pg, "reconcileTextureDeclarations").mockImplementation(() =>
      calls.push("reconcile"),
    );
    vi.spyOn(pg, "scheduleRun").mockImplementation(() =>
      calls.push("schedule"),
    );
    render(EditorPage, { pg, saveController });

    components.editorProps?.oninput?.();

    expect(calls).toEqual(["schedule"]);
  });
});
