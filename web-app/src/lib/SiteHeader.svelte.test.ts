// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth/AuthMenu.svelte", () => ({
  default(anchor: Node) {
    const marker = document.createElement("div");
    marker.dataset.testid = "auth-menu";
    anchor.parentNode?.insertBefore(marker, anchor);
  },
}));

import SiteHeader from "./SiteHeader.svelte";

describe("SiteHeader", () => {
  beforeEach(() => history.replaceState(null, "", "/"));

  it("renders terse microcode-neutral navigation and delegates auth", () => {
    render(SiteHeader);
    expect(
      screen.getByRole("button", { name: "n64.toys" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("auth-menu")).toBeInTheDocument();
    expect(screen.queryByText(/F3DEX2/i)).not.toBeInTheDocument();
  });

  it("opens a blank draft and returns to browse", async () => {
    render(SiteHeader);
    await fireEvent.click(screen.getByRole("button", { name: "create toy" }));
    expect(location.hash).toBe("#new");
    await fireEvent.click(screen.getByRole("button", { name: "browse" }));
    expect(location.hash).toBe("");
  });
});
