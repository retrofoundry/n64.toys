<script lang="ts">
  import { Dialog } from "bits-ui";

  import { authActions as defaultAuthActions, type AuthActions } from "./auth-client";

  let { authActions = defaultAuthActions }: { authActions?: AuthActions } = $props();

  let submitting = $state(false);
  let errorMessage = $state<string | null>(null);

  async function startLogin() {
    if (submitting) return;
    submitting = true;
    errorMessage = null;
    try {
      await authActions.signInWithGitHub();
    } catch {
      errorMessage = "Unable to start GitHub login. Please try again.";
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root>
  <Dialog.Trigger
    class="ui-button"
  >
    Log in
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-40 bg-black/70" />
    <Dialog.Content
      class="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-none border border-edge-hi bg-panel p-6 focus:outline-none"
    >
      <Dialog.Title class="text-sm font-bold uppercase tracking-wide text-ink">log in</Dialog.Title>
      <Dialog.Description class="mt-3 text-sm leading-6 text-ink-dim">
        Log in to publish toys. GitHub supplies your identity; no repository access is requested.
      </Dialog.Description>

      {#if errorMessage}
        <p role="alert" class="mt-4 border border-n64-red/60 bg-n64-red/10 p-3 text-sm text-ink">
          {errorMessage}
        </p>
      {/if}

      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <Dialog.Close
          class="ui-button ui-button-quiet"
        >
          Cancel
        </Dialog.Close>
        <button
          type="button"
          disabled={submitting}
          onclick={startLogin}
          class="ui-button ui-button-primary"
        >
          {submitting ? "Connecting…" : "Continue with GitHub"}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
