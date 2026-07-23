<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Playground } from "./lib/playground.svelte";
  import { resolveEditorRoute, routeFromHash } from "./lib/route";
  import { repository } from "./toys/repository";
  import SiteHeader from "./lib/SiteHeader.svelte";
  import SiteFooter from "./lib/SiteFooter.svelte";
  import BrowsePage from "./lib/BrowsePage.svelte";
  import MyToys from "./lib/MyToys.svelte";
  import UserPage from "./lib/UserPage.svelte";
  import EditorPage from "./lib/EditorPage.svelte";
  import { SaveController } from "./lib/save-controller.svelte";
  import { NavGuard } from "./lib/nav-guard.svelte";
  import { authSession } from "./lib/auth/auth-client";

  let pg = $state(new Playground());
  let canvasEl = $state<HTMLCanvasElement>();
  let route = $state(routeFromHash(location.hash));
  const inEditor = $derived(route.kind === "new" || route.kind === "toy");
  // Editor back button returns to the originating list (Browse or My toys).
  let lastListHash = $state(routeFromHash(location.hash).kind === "mine" ? "mine" : "");
  $effect(() => {
    if (route.kind === "browse") lastListHash = "";
    else if (route.kind === "mine") lastListHash = "mine";
  });
  const saveController: SaveController = new SaveController(untrack(() => pg), {
    getCanvas: () => canvasEl,
    navigateToSlug: (slug): Promise<void> =>
      navGuard.requestExit(() => {
        location.hash = `t=${slug}`;
      }),
  });
  const navGuard: NavGuard = new NavGuard(
    (): boolean => saveController.isDirty,
  );

  function waitForAuthReady(): Promise<void> {
    return new Promise((resolve) => {
      let stop = () => {};
      let settled = false;
      const unsubscribe = authSession.subscribe((state) => {
        if (!state.isPending && !settled) {
          settled = true;
          resolve();
          stop();
        }
      });
      stop = unsubscribe;
      if (settled) stop();
    });
  }

  onMount(() => {
    const onHash = () => (route = routeFromHash(location.hash));
    window.addEventListener("hashchange", onHash);
    window.addEventListener("beforeunload", navGuard.handleBeforeUnload);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("beforeunload", navGuard.handleBeforeUnload);
    };
  });

  $effect(() => {
    const hasPendingRecovery = saveController.hasPendingDraft();
    if (!inEditor && !hasPendingRecovery) {
      untrack(() => pg.teardown());
      return;
    }
    if (!canvasEl) return;
    const canvas = canvasEl;
    const requested = route;
    const controller = new AbortController();

    const transition = async () => {
      try {
        await pg.init(canvas);
        controller.signal.throwIfAborted();
        await waitForAuthReady();
        controller.signal.throwIfAborted();
        if (await saveController.restorePendingDraft()) return;
        controller.signal.throwIfAborted();
        if (
          requested.kind === "browse" ||
          requested.kind === "mine" ||
          requested.kind === "user"
        ) {
          pg.teardown();
          return;
        }
        const resolved = await resolveEditorRoute(requested, repository);
        controller.signal.throwIfAborted();
        if (resolved.kind === "browse") {
          location.hash = "";
        } else if (resolved.kind === "new") {
          await pg.newDraft({ signal: controller.signal });
          saveController.adoptLoadedToy(null);
        } else {
          await pg.loadToy(resolved.toy, { signal: controller.signal });
          saveController.adoptLoadedToy(resolved.toy);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          pg.status = `init failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    };
    void transition();
    return () => {
      controller.abort();
      untrack(() => pg.teardown());
    };
  });
</script>

<div class="flex min-h-screen flex-col bg-base text-ink">
  <SiteHeader />
  <div class="flex-1">
    <div class:hidden={route.kind !== "browse"}>
      <BrowsePage active={route.kind === "browse"} />
    </div>
    <div class:hidden={route.kind !== "mine"}>
      <MyToys active={route.kind === "mine"} />
    </div>
    <div class:hidden={route.kind !== "user"}>
      <UserPage
        userId={route.kind === "user" ? route.id : ""}
        active={route.kind === "user"}
      />
    </div>
    <div class:hidden={!inEditor}>
      <EditorPage
        bind:pg
        bind:canvas={canvasEl}
        {saveController}
        onexit={() =>
          navGuard.requestExit(() => {
            saveController.adoptLoadedToy(null);
            location.hash = lastListHash;
          })}
      />
    </div>
  </div>
  <div class:hidden={inEditor}>
    <SiteFooter />
  </div>
</div>
