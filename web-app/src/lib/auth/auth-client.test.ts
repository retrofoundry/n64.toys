import { describe, expect, it, vi } from "vitest";

import {
  authCallbackURLs,
  consumeAuthError,
  createAuthActions,
  type AuthClientPort,
} from "./auth-client";

function fakeClient(overrides: Partial<AuthClientPort> = {}): AuthClientPort {
  return {
    signIn: {
      social: vi.fn(async () => ({ data: null, error: null })),
    },
    signOut: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  };
}

describe("GitHub auth actions", () => {
  it("starts GitHub sign-in with same-origin callback URLs that preserve the current route", async () => {
    const social = vi.fn(async () => ({ data: null, error: null }));
    const client = fakeClient({ signIn: { social } });
    const actions = createAuthActions(client, () => "https://toys.example/edit?mode=fast#new");

    await actions.signInWithGitHub();

    expect(social).toHaveBeenCalledOnce();
    expect(social).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "https://toys.example/edit?mode=fast#new",
      errorCallbackURL:
        "https://toys.example/edit?mode=fast&auth_error=github&auth_return_hash=%23new",
    });
  });

  it("turns a Better Auth sign-in error into a safe user-facing Error", async () => {
    const client = fakeClient({
      signIn: {
        social: vi.fn(async () => ({
          data: null,
          error: { message: "provider response containing secret material" },
        })),
      },
    });

    await expect(createAuthActions(client, () => "https://toys.example/#new").signInWithGitHub()).rejects.toThrow(
      "Unable to start GitHub login. Please try again.",
    );
  });

  it("turns a Better Auth sign-out error into a safe user-facing Error", async () => {
    const client = fakeClient({
      signOut: vi.fn(async () => ({
        data: null,
        error: { message: "database detail that must stay private" },
      })),
    });

    await expect(createAuthActions(client, () => "https://toys.example/").signOut()).rejects.toThrow(
      "Unable to log out. Please try again.",
    );
  });
});

describe("auth callback URL helpers", () => {
  it("preserves the hash route without placing a fragment in Better Auth's error callback", () => {
    const urls = authCallbackURLs("https://toys.example/play?theme=dark#t=future-toy");

    expect(new URL(urls.callbackURL).hash).toBe("#t=future-toy");
    const errorCallback = new URL(urls.errorCallbackURL);
    expect(errorCallback.hash).toBe("");
    expect(errorCallback.searchParams.get("auth_error")).toBe("github");
    expect(errorCallback.searchParams.get("auth_return_hash")).toBe("#t=future-toy");
  });

  it("consumes the OAuth marker while preserving unrelated query parameters and the hash", () => {
    const replace = vi.fn();

    const message = consumeAuthError(
      "https://toys.example/play?theme=dark&auth_error=github&panel=code#new",
      replace,
    );

    expect(message).toBe("GitHub login could not be completed. Please try again.");
    expect(replace).toHaveBeenCalledWith("/play?theme=dark&panel=code#new");
  });

  it("restores the route and removes Better Auth's raw appended OAuth error parameters", () => {
    const replace = vi.fn();
    const { errorCallbackURL } = authCallbackURLs(
      "https://toys.example/play?theme=dark&panel=code#new",
    );
    const redirected = `${errorCallbackURL}&error=access_denied&error_description=raw+provider+detail`;

    const message = consumeAuthError(redirected, replace);

    expect(message).toBe("GitHub login could not be completed. Please try again.");
    expect(replace).toHaveBeenCalledWith("/play?theme=dark&panel=code#new");
  });

  it("does not rewrite history when no supported OAuth marker is present", () => {
    const replace = vi.fn();

    expect(consumeAuthError("https://toys.example/play?theme=dark#new", replace)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
