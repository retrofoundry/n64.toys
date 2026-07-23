import { createAuthClient } from "better-auth/svelte";

export type AuthUser = { name: string; email: string; image?: string | null };
export type AuthViewState = {
  data: { user: AuthUser } | null;
  isPending: boolean;
  error: { message?: string } | null;
};
export type AuthActions = {
  signInWithGitHub(): Promise<void>;
  signOut(): Promise<void>;
};
export type AuthSessionSource = {
  subscribe: (run: (state: AuthViewState) => void) => () => void;
  refetch: () => void | Promise<void>;
};

type AuthResult = { error?: unknown } | void;
type SocialSignInInput = {
  provider: "github";
  callbackURL: string;
  errorCallbackURL: string;
};

export type AuthClientPort = {
  signIn: { social(input: SocialSignInInput): Promise<AuthResult> };
  signOut(): Promise<AuthResult>;
};

type RawSessionState = {
  data: { user: AuthUser } | null;
  isPending: boolean;
  error: unknown;
  refetch(): void | Promise<void>;
};

type SessionAtomPort = {
  subscribe(run: (state: RawSessionState) => void): () => void;
  get(): RawSessionState;
};

const SIGN_IN_FAILURE = "Unable to start GitHub login. Please try again.";
const SIGN_OUT_FAILURE = "Unable to log out. Please try again.";
const SESSION_FAILURE = "Authentication is temporarily unavailable.";
const RETURN_HASH_PARAM = "auth_return_hash";
const AUTH_ERROR_PARAMS = ["auth_error", RETURN_HASH_PARAM, "error", "error_description"];

export function authCallbackURLs(currentHref: string): {
  callbackURL: string;
  errorCallbackURL: string;
} {
  const callback = new URL(currentHref);
  const errorCallback = new URL(callback);
  const returnHash = errorCallback.hash;
  errorCallback.hash = "";
  for (const parameter of AUTH_ERROR_PARAMS) errorCallback.searchParams.delete(parameter);
  errorCallback.searchParams.set("auth_error", "github");
  if (returnHash) errorCallback.searchParams.set(RETURN_HASH_PARAM, returnHash);
  return { callbackURL: callback.toString(), errorCallbackURL: errorCallback.toString() };
}

function resultFailed(result: AuthResult): boolean {
  return typeof result === "object" && result !== null && "error" in result && Boolean(result.error);
}

async function runAuthAction(operation: () => Promise<AuthResult>, safeMessage: string): Promise<void> {
  let result: AuthResult;
  try {
    result = await operation();
  } catch {
    throw new Error(safeMessage);
  }
  if (resultFailed(result)) throw new Error(safeMessage);
}

export function createAuthActions(
  client: AuthClientPort,
  currentHref: () => string = () => window.location.href,
): AuthActions {
  return {
    async signInWithGitHub() {
      const urls = authCallbackURLs(currentHref());
      await runAuthAction(
        () => client.signIn.social({ provider: "github", ...urls }),
        SIGN_IN_FAILURE,
      );
    },
    async signOut() {
      await runAuthAction(() => client.signOut(), SIGN_OUT_FAILURE);
    },
  };
}

export function consumeAuthError(
  currentHref: string = window.location.href,
  replace: (path: string) => void = (path) =>
    window.history.replaceState(window.history.state, "", path),
): string | null {
  const url = new URL(currentHref);
  const marker = url.searchParams.get("auth_error");
  if (marker === null) return null;

  const returnHash = url.searchParams.get(RETURN_HASH_PARAM);
  for (const parameter of AUTH_ERROR_PARAMS) url.searchParams.delete(parameter);
  if (returnHash) url.hash = returnHash;
  replace(`${url.pathname}${url.search}${url.hash}`);
  return marker === "github"
    ? "GitHub login could not be completed. Please try again."
    : "Login could not be completed. Please try again.";
}

function createSessionSource(atom: SessionAtomPort): AuthSessionSource {
  return {
    subscribe(run) {
      return atom.subscribe((state) =>
        run({
          data: state.data === null ? null : { user: state.data.user },
          isPending: state.isPending,
          error: state.error ? { message: SESSION_FAILURE } : null,
        }),
      );
    },
    refetch() {
      return atom.get().refetch();
    },
  };
}

const browserClientOptions =
  typeof window === "undefined" ? {} : { baseURL: window.location.origin };

export const authClient = createAuthClient(browserClientOptions);
export const authSession = createSessionSource(authClient.useSession());
export const authActions = createAuthActions(authClient);
