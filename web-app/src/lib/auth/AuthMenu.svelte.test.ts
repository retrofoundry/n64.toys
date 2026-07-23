// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { describe, expect, it, vi } from "vitest";

import type { AuthActions, AuthSessionSource, AuthViewState } from "./auth-client";
import AuthMenu from "./AuthMenu.svelte";

function session(initial: AuthViewState) {
  const state = writable(initial);
  const refetch = vi.fn(async () => undefined);
  return {
    source: { subscribe: state.subscribe, refetch } satisfies AuthSessionSource,
    set: state.set,
    refetch,
  };
}

function actions(overrides: Partial<AuthActions> = {}): AuthActions {
  return {
    signInWithGitHub: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  };
}

const signedOut: AuthViewState = { data: null, isPending: false, error: null };
const signedIn: AuthViewState = {
  data: { user: { name: "Ada Hopper", email: "ada@example.com", image: null } },
  isPending: false,
  error: null,
};

function renderMenu(
  sessionSource: AuthSessionSource,
  authActions: AuthActions = actions(),
  consumeCallbackError: () => string | null = () => null,
) {
  return render(AuthMenu, { sessionSource, authActions, consumeCallbackError });
}

async function openAccountMenu() {
  const trigger = screen.getByRole("button", { name: "Account menu for Ada Hopper" });
  await fireEvent.click(trigger);
  return screen.findByRole("menu");
}

describe("AuthMenu", () => {
  it("shows a stable labelled control while the session is pending", () => {
    const authSession = session({ data: null, isPending: true, error: null });

    renderMenu(authSession.source);

    expect(screen.getByRole("button", { name: "Checking login status" })).toBeDisabled();
  });

  it("composes the login dialog when signed out", async () => {
    const authSession = session(signedOut);

    renderMenu(authSession.source);
    await fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("dialog", { name: "log in" })).toBeInTheDocument();
  });

  it("shows the signed-in identity and exposes account actions in a dropdown", async () => {
    const authSession = session(signedIn);

    renderMenu(authSession.source);

    expect(screen.getByText("AH")).toBeInTheDocument();
    await openAccountMenu();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "My toys" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
  });

  it("navigates to the current user's toys from the account menu", async () => {
    history.replaceState(null, "", "/");
    const authSession = session(signedIn);
    renderMenu(authSession.source);
    await openAccountMenu();

    await fireEvent.click(screen.getByRole("menuitem", { name: "My toys" }));

    expect(location.hash).toBe("#mine");
  });

  it("keeps the signed-in presentation while logout is pending and changes with the session", async () => {
    let finish!: () => void;
    const signOut = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const authSession = session(signedIn);
    renderMenu(authSession.source, actions({ signOut }));
    await openAccountMenu();

    await fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Account menu for Ada Hopper" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Log in" })).not.toBeInTheDocument();

    finish();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Account menu for Ada Hopper" })).toBeEnabled(),
    );
    expect(screen.queryByRole("button", { name: "Log in" })).not.toBeInTheDocument();

    authSession.set(signedOut);
    expect(await screen.findByRole("button", { name: "Log in" })).toBeInTheDocument();
  });

  it("stays signed in and offers a retry when logout fails", async () => {
    const signOut = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("private server detail"))
      .mockResolvedValueOnce(undefined);
    const authSession = session(signedIn);
    renderMenu(authSession.source, actions({ signOut }));
    await openAccountMenu();

    await fireEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to log out. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Account menu for Ada Hopper" })).toBeEnabled();
    expect(screen.queryByText(/private server detail/i)).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Retry logout" }));
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("shows a retryable unavailable state when session loading fails", async () => {
    const authSession = session({
      data: null,
      isPending: false,
      error: { message: "Authentication is temporarily unavailable." },
    });

    renderMenu(authSession.source);

    expect(screen.getByText("Login unavailable")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Retry login status" }));
    expect(authSession.refetch).toHaveBeenCalledOnce();
  });

  it("announces a consumed OAuth callback error without disabling login", () => {
    const consumeCallbackError = vi.fn(
      () => "GitHub login could not be completed. Please try again.",
    );
    const authSession = session(signedOut);

    renderMenu(authSession.source, actions(), consumeCallbackError);

    expect(screen.getByRole("status")).toHaveTextContent(
      "GitHub login could not be completed. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
    expect(consumeCallbackError).toHaveBeenCalledOnce();
  });
});
