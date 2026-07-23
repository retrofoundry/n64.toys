// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/SiteHeader.svelte", () => ({
  default(anchor: Node) {
    const element = document.createElement("div");
    element.dataset.testid = "site-header";
    anchor.parentNode?.insertBefore(element, anchor);
  },
}));
vi.mock("./lib/BrowsePage.svelte", () => ({
  default(anchor: Node) {
    const element = document.createElement("div");
    element.dataset.testid = "browse-page";
    anchor.parentNode?.insertBefore(element, anchor);
  },
}));
vi.mock("./lib/MyToys.svelte", () => ({
  default(anchor: Node) {
    const element = document.createElement("div");
    element.dataset.testid = "my-toys";
    anchor.parentNode?.insertBefore(element, anchor);
  },
}));
vi.mock("./lib/UserPage.svelte", () => ({
  default(anchor: Node, props: { userId: string }) {
    const element = document.createElement("div");
    element.dataset.testid = "user-page";
    element.dataset.userId = props.userId;
    anchor.parentNode?.insertBefore(element, anchor);
  },
}));
vi.mock("./lib/EditorPage.svelte", () => ({
  default(anchor: Node) {
    const element = document.createElement("div");
    element.dataset.testid = "editor-page";
    anchor.parentNode?.insertBefore(element, anchor);
  },
}));

import App from "./App.svelte";
import { Playground } from "./lib/playground.svelte";

describe("App page lifetime", () => {
  beforeEach(() => history.replaceState(null, "", "/"));

  it("settles the browse lifecycle without tracking teardown state", async () => {
    const teardown = vi.spyOn(Playground.prototype, "teardown");

    render(App);
    await tick();
    await tick();

    expect(teardown).toHaveBeenCalledOnce();
  });

  it("keeps all pages mounted while hash navigation changes visibility", async () => {
    render(App);
    const browse = screen.getByTestId("browse-page");
    const mine = screen.getByTestId("my-toys");
    const user = screen.getByTestId("user-page");
    const editor = screen.getByTestId("editor-page");

    expect(browse.parentElement).not.toHaveClass("hidden");
    expect(mine.parentElement).toHaveClass("hidden");
    expect(user.parentElement).toHaveClass("hidden");
    expect(editor.parentElement).toHaveClass("hidden");
    location.hash = "mine";
    await fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByTestId("browse-page")).toBe(browse);
    expect(screen.getByTestId("my-toys")).toBe(mine);
    expect(screen.getByTestId("user-page")).toBe(user);
    expect(screen.getByTestId("editor-page")).toBe(editor);
    expect(browse.parentElement).toHaveClass("hidden");
    expect(mine.parentElement).not.toHaveClass("hidden");
    expect(user.parentElement).toHaveClass("hidden");
    expect(editor.parentElement).toHaveClass("hidden");

    location.hash = "u=author123";
    await fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByTestId("user-page")).toBe(user);
    expect(browse.parentElement).toHaveClass("hidden");
    expect(mine.parentElement).toHaveClass("hidden");
    expect(user.parentElement).not.toHaveClass("hidden");
    expect(editor.parentElement).toHaveClass("hidden");

    location.hash = "new";
    await fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByTestId("browse-page")).toBe(browse);
    expect(screen.getByTestId("my-toys")).toBe(mine);
    expect(screen.getByTestId("editor-page")).toBe(editor);
    expect(browse.parentElement).toHaveClass("hidden");
    expect(mine.parentElement).toHaveClass("hidden");
    expect(user.parentElement).toHaveClass("hidden");
    expect(editor.parentElement).not.toHaveClass("hidden");
  });

  it("passes the routed user id to the public user page", () => {
    history.replaceState(null, "", "/#u=author123");

    render(App);

    const user = screen.getByTestId("user-page");
    expect(user).toHaveAttribute("data-user-id", "author123");
    expect(user.parentElement).not.toHaveClass("hidden");
  });
});
