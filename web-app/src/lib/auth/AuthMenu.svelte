<script lang="ts">
  import { Avatar, DropdownMenu } from "bits-ui";
  import { onMount } from "svelte";

  import {
    authActions as defaultAuthActions,
    authSession as defaultAuthSession,
    consumeAuthError,
    type AuthActions,
    type AuthSessionSource,
    type AuthUser,
  } from "./auth-client";
  import LoginDialog from "./LoginDialog.svelte";

  let {
    sessionSource = defaultAuthSession,
    authActions = defaultAuthActions,
    consumeCallbackError = consumeAuthError,
  }: {
    sessionSource?: AuthSessionSource;
    authActions?: AuthActions;
    consumeCallbackError?: () => string | null;
  } = $props();

  let callbackError = $state<string | null>(null);
  let logoutPending = $state(false);
  let logoutError = $state<string | null>(null);

  onMount(() => {
    callbackError = consumeCallbackError();
  });

  function initials(user: AuthUser): string {
    const parts = user.name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts.at(-1)?.[0]}`.toUpperCase();
  }

  async function logOut() {
    if (logoutPending) return;
    logoutPending = true;
    logoutError = null;
    try {
      await authActions.signOut();
    } catch {
      logoutError = "Unable to log out. Please try again.";
    } finally {
      logoutPending = false;
    }
  }

  function retrySession() {
    void sessionSource.refetch();
  }
</script>

<div class="relative flex items-center gap-2">
  {#if callbackError}
    <p
      role="status"
      class="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-80 border border-edge bg-panel p-3 text-sm text-ink"
    >
      {callbackError}
      <button
        type="button"
        class="ui-button ui-button-quiet ml-2"
        aria-label="Dismiss login error"
        onclick={() => (callbackError = null)}
      >
        dismiss
      </button>
    </p>
  {/if}

  {#if $sessionSource.isPending}
    <button
      type="button"
      aria-label="Checking login status"
      disabled
      class="ui-button min-w-28 text-ink-faint"
    >
      Checking…
    </button>
  {:else if $sessionSource.error}
    <span class="text-sm text-ink-dim">Login unavailable</span>
    <button
      type="button"
      aria-label="Retry login status"
      class="ui-button"
      onclick={retrySession}
    >
      Retry
    </button>
  {:else if $sessionSource.data}
    {@const user = $sessionSource.data.user}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={logoutPending}
        aria-label={`Account menu for ${user.name}`}
        class="ui-button flex items-center gap-2"
      >
        <Avatar.Root class="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-edge-hi">
          {#if user.image}
            <Avatar.Image src={user.image} alt="" class="size-full object-cover" />
          {/if}
          <Avatar.Fallback class="text-[10px] font-bold text-ink">{initials(user)}</Avatar.Fallback>
        </Avatar.Root>
        <span class="max-w-40 truncate">{user.name}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          class="z-50 min-w-56 border border-edge bg-panel p-1 focus:outline-none"
        >
          <DropdownMenu.Group>
            <DropdownMenu.GroupHeading class="px-2 py-1.5 text-xs text-ink-faint">
              {user.email}
            </DropdownMenu.GroupHeading>
            <DropdownMenu.Item
              disabled={logoutPending}
              onSelect={() => (location.hash = "mine")}
              class="cursor-pointer px-2 py-2 text-sm text-ink outline-none data-[highlighted]:bg-raised data-[disabled]:opacity-60"
            >
              My toys
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled={logoutPending}
              onSelect={() => void logOut()}
              class="cursor-pointer px-2 py-2 text-sm text-ink outline-none data-[highlighted]:bg-raised data-[disabled]:opacity-60"
            >
              {logoutPending ? "Logging out…" : "Log out"}
            </DropdownMenu.Item>
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>

    {#if logoutError}
      <div
        role="alert"
        class="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-72 border border-edge bg-panel p-3 text-sm text-ink"
      >
        <p>{logoutError}</p>
        <button
          type="button"
          aria-label="Retry logout"
          class="ui-button ui-button-quiet mt-2"
          onclick={logOut}
        >
          Retry
        </button>
      </div>
    {/if}
  {:else}
    <LoginDialog {authActions} />
  {/if}
</div>
