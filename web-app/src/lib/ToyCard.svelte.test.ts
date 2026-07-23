// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";

import type { ToySummary } from "../toys/types";
import ToyCard from "./ToyCard.svelte";

const toy: ToySummary = {
  slug: "quiet-cube",
  title: "Quiet cube",
  description: "A small cube",
  visibility: "public",
  microcode: "F3DEX2",
  owner: { id: "user1", displayName: "Ada Hopper" },
  thumbnailUrl: "/api/toys/quiet-cube/thumbnail",
  forkOf: null,
  isOwner: false,
  createdAt: "2026-07-22T12:00:00.000Z",
};

describe("ToyCard", () => {
  beforeEach(() => history.replaceState(null, "", "/"));

  it("renders the thumbnail, title, and owner display name", () => {
    render(ToyCard, { toy });

    expect(
      screen.getByRole("img", { name: "Quiet cube thumbnail" }),
    ).toHaveAttribute("src", toy.thumbnailUrl);
    expect(screen.getByText("Quiet cube")).toBeInTheDocument();
    expect(screen.getByText("by Ada Hopper")).toBeInTheDocument();
    expect(screen.getByText("F3DEX2")).toBeInTheDocument();
    expect(screen.queryByText("public")).not.toBeInTheDocument();
  });

  it("shows visibility only when requested", () => {
    render(ToyCard, {
      toy: { ...toy, visibility: "private" },
      showVisibility: true,
    });

    expect(screen.getByText("private")).toBeInTheDocument();
    expect(screen.getByText("private")).toHaveClass("tag");
  });

  it("uses a restrained placeholder when no thumbnail exists", () => {
    render(ToyCard, { toy: { ...toy, thumbnailUrl: null } });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("no thumbnail")).toBeInTheDocument();
  });

  it("opens the toy from both its thumbnail and title", async () => {
    render(ToyCard, { toy });

    await fireEvent.click(
      screen.getByRole("img", { name: "Quiet cube thumbnail" }),
    );
    expect(location.hash).toBe("#t=quiet-cube");

    history.replaceState(null, "", "/");
    await fireEvent.click(screen.getByText("Quiet cube"));
    expect(location.hash).toBe("#t=quiet-cube");
  });

  it("opens the author without opening the toy or nesting buttons", async () => {
    render(ToyCard, { toy });

    await fireEvent.click(
      screen.getByRole("button", { name: "by Ada Hopper" }),
    );

    expect(location.hash).toBe("#u=user1");
    expect(document.querySelector("button button")).toBeNull();
  });

  it("renders authored text without interpreting HTML", () => {
    render(ToyCard, {
      toy: {
        ...toy,
        title: "<em>safe title</em>",
        owner: { ...toy.owner, displayName: "<strong>Ada</strong>" },
      },
    });

    expect(screen.queryByText("safe title")).not.toBeInTheDocument();
    expect(screen.getByText("<em>safe title</em>")).toBeInTheDocument();
    expect(document.querySelector("em")).toBeNull();
    expect(document.querySelector("strong strong")).toBeNull();
  });
});
