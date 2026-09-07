// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import type { AuthActions } from "./auth-client";
import LoginDialog from "./LoginDialog.svelte";

function actions(
  signInWithGitHub: AuthActions["signInWithGitHub"] = vi.fn(async () => undefined),
): AuthActions {
  return { signInWithGitHub, signOut: vi.fn(async () => undefined) };
}

async function openDialog(authActions: AuthActions) {
  render(LoginDialog, { authActions });
  const trigger = screen.getByRole("button", { name: "Log in" });
  trigger.focus();
  await fireEvent.click(trigger);
  return screen.findByRole("dialog");
}

describe("LoginDialog", () => {
  it("explains the terse GitHub identity boundary in an accessible dialog", async () => {
    const dialog = await openDialog(actions());
    const title = screen.getByRole("heading", { name: "log in" });
    const description = screen.getByText(/log in to publish toys/i);

    expect(screen.getByText(/no repository access/i)).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-labelledby", title.id);
    expect(dialog).toHaveAttribute("aria-describedby", description.id);
  });

  it("starts GitHub login exactly once while redirect setup is pending", async () => {
    let finish!: () => void;
    const signInWithGitHub = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    await openDialog(actions(signInWithGitHub));
    const continueButton = screen.getByRole("button", { name: "Continue with GitHub" });

    await fireEvent.click(continueButton);

    expect(continueButton).toBeDisabled();
    await fireEvent.click(continueButton);
    expect(signInWithGitHub).toHaveBeenCalledOnce();

    finish();
    await waitFor(() => expect(continueButton).not.toBeDisabled());
  });

  it("keeps the dialog open and shows a safe inline error when OAuth start fails", async () => {
    const signInWithGitHub = vi.fn(async () => {
      throw new Error("provider response containing secret material");
    });
    await openDialog(actions(signInWithGitHub));

    await fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to start GitHub login. Please try again.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(/secret material/i)).not.toBeInTheDocument();
  });

  it("closes with Escape and restores focus to the trigger", async () => {
    await openDialog(actions());
    const trigger = screen.getByRole("button", { name: "Log in" });

    await fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
