// @vitest-environment jsdom

import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/SiteHeader.svelte", () => ({
  default(anchor: Node) {
    const element = document.createElement("div");
    anchor.parentNode?.insertBefore(element, anchor);
  },
}));
vi.mock("./lib/BrowsePage.svelte", () => ({
  default(anchor: Node) {
    const element = document.createElement("div");
    anchor.parentNode?.insertBefore(element, anchor);
  },
}));
vi.mock("./lib/MyToys.svelte", () => ({
  default(anchor: Node) {
    const element = document.createElement("div");
    anchor.parentNode?.insertBefore(element, anchor);
  },
}));

import App from "./App.svelte";

describe("App ownership", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    history.replaceState(null, "", "/");
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it("passes the playground ownership binding through EditorPage", async () => {
    render(App);
    await tick();

    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("ownership_invalid_binding"),
    );
  });
});
