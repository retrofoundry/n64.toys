// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SaveControls from "./SaveControls.svelte";
import {
  PENDING_DRAFT_KEY,
  SaveController,
} from "./save-controller.svelte";

function controller(
  status: SaveController["status"] = "idle",
  overrides: Partial<SaveController> = {},
): SaveController {
  return {
    status,
    visibility: "private",
    ownedSlug: undefined,
    pendingDraft: false,
    errorMessage: status === "error" ? "server said no" : undefined,
    save: vi.fn(async () => undefined),
    deleteToy: vi.fn(async () => undefined),
    setVisibility: vi.fn(),
    discardPendingDraft: vi.fn(),
    ...overrides,
  } as unknown as SaveController;
}

afterEach(() => vi.restoreAllMocks());

describe("SaveControls", () => {
  it("reflects saving, saved, and error statuses", () => {
    const saving = render(SaveControls, { controller: controller("saving") });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    saving.unmount();

    const saved = render(SaveControls, { controller: controller("saved") });
    expect(screen.getByRole("status")).toHaveTextContent("saved");
    saved.unmount();

    render(SaveControls, { controller: controller("error") });
    expect(screen.getByRole("alert")).toHaveTextContent("server said no");
  });

  it("offers all visibility choices and delegates changes", async () => {
    const saves = controller();
    render(SaveControls, { controller: saves });

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "private",
      "unlisted",
      "public",
    ]);
    await fireEvent.change(screen.getByRole("combobox", { name: "visibility" }), {
      target: { value: "unlisted" },
    });
    expect(saves.setVisibility).toHaveBeenCalledWith("unlisted");
  });

  it("saves with the button and Cmd/Ctrl-S", async () => {
    const saves = controller();
    render(SaveControls, { controller: saves });

    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await fireEvent.keyDown(window, { key: "s", metaKey: true });
    await fireEvent.keyDown(window, { key: "s", ctrlKey: true });

    expect(saves.save).toHaveBeenCalledTimes(3);
  });

  it("labels the button Update for an owned toy and hides Discard without a pending draft", () => {
    render(SaveControls, { controller: controller("idle", { ownedSlug: "abc123" }) });

    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard draft" })).toBeNull();
  });

  it("only shows Delete for an owned toy", () => {
    const draft = render(SaveControls, { controller: controller() });
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    draft.unmount();

    render(SaveControls, {
      controller: controller("idle", { ownedSlug: "abc" }),
    });
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("deletes only after confirmation", async () => {
    const saves = controller("idle", { ownedSlug: "abc" });
    const confirm = vi.spyOn(window, "confirm");
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(SaveControls, { controller: saves });
    const button = screen.getByRole("button", { name: "Delete" });

    await fireEvent.click(button);
    expect(saves.deleteToy).not.toHaveBeenCalled();

    await fireEvent.click(button);
    expect(confirm).toHaveBeenCalledWith(
      "Delete this toy permanently? This cannot be undone.",
    );
    expect(saves.deleteToy).toHaveBeenCalledOnce();
  });

  it("explicitly discards a protected draft", async () => {
    const saves = controller("idle", { pendingDraft: true });
    render(SaveControls, { controller: saves });

    await fireEvent.click(
      screen.getByRole("button", { name: "Discard draft" }),
    );

    expect(saves.discardPendingDraft).toHaveBeenCalledOnce();
  });

  it("protects a login-requiring save, starts GitHub login, and can discard it", async () => {
    sessionStorage.clear();
    const signInWithGitHub = vi.fn(async () => undefined);
    const saves = new SaveController(
      {
        source: "draft source",
        title: "draft title",
        description: "",
        textureSlots: [],
        settings: { microcode: "F3DEX2" },
        renderForCapture: vi.fn(() => true),
        newDraft: vi.fn(),
        reconcileTextureDeclarations: vi.fn(),
        loadTexture: vi.fn(),
        run: vi.fn(),
      } as never,
      {
        getAuthState: () => ({
          data: null,
          isPending: false,
          error: null,
        }),
        authActions: { signInWithGitHub, signOut: vi.fn() },
        storage: sessionStorage,
      },
    );
    render(SaveControls, { controller: saves });

    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(signInWithGitHub).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(PENDING_DRAFT_KEY)).not.toBeNull();

    await fireEvent.click(
      screen.getByRole("button", { name: "Discard draft" }),
    );
    expect(sessionStorage.getItem(PENDING_DRAFT_KEY)).toBeNull();
  });
});
