// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToyRepository } from "../toys/repository";
import type { ToyList, ToySummary } from "../toys/types";
import BrowsePage from "./BrowsePage.svelte";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  return {
    promise: new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
    resolve,
    reject,
  };
}

function repository(list: ToyRepository["list"]): ToyRepository {
  return {
    list,
    listMine: vi.fn(async (page = 1) => ({ toys: [], page, pageCount: 0 })),
    listUserPublic: vi.fn(async (userId, page = 1) => ({
      owner: { id: userId, displayName: "" },
      toys: [],
      page,
      pageCount: 0,
    })),
    get: vi.fn(async () => null),
  };
}

const toy: ToySummary = {
  slug: "quiet-cube",
  title: "Quiet cube",
  description: "A small cube",
  visibility: "public",
  microcode: "F3DEX2",
  owner: { id: "user-1", displayName: "Ada Hopper" },
  thumbnailUrl: "/api/toys/quiet-cube/thumbnail",
  forkOf: null,
  isOwner: false,
  createdAt: "2026-07-22T12:00:00.000Z",
};

const empty: ToyList = { toys: [], page: 1, pageCount: 0 };

describe("BrowsePage", () => {
  beforeEach(() => history.replaceState(null, "", "/"));

  it("moves from a stable loading state to the empty public gallery", async () => {
    const request = deferred<ToyList>();
    render(BrowsePage, { toyRepository: repository(() => request.promise) });

    expect(screen.getByRole("status")).toHaveTextContent("loading toys");
    expect(screen.getByRole("status")).toHaveClass("browse-canvas");
    expect(screen.getByRole("status")).not.toHaveClass("border");
    request.resolve(empty);
    expect(await screen.findByText("no toys here yet")).toBeInTheDocument();
    const emptyGallery = screen.getByRole("region", { name: "published toys" });
    expect(emptyGallery).toHaveClass("browse-canvas");
    expect(emptyGallery).not.toHaveClass("border");
    expect(
      screen.queryByRole("heading", { name: "published toys" }),
    ).not.toBeInTheDocument();
  });

  it("leaves creation to the primary site navigation", async () => {
    render(BrowsePage, { toyRepository: repository(async () => empty) });

    expect(
      await screen.findByText("published toys will appear here"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "create toy" }),
    ).not.toBeInTheDocument();
    expect(location.hash).toBe("");
  });

  it("shows a safe inline error and retries the repository", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("private detail"))
      .mockResolvedValueOnce(empty);
    render(BrowsePage, { toyRepository: repository(list) });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "unable to load toys",
    );
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(await screen.findByText("no toys here yet")).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("renders cards and relists as pagination moves within its bounds", async () => {
    const pageOne: ToyList = { toys: [toy], page: 1, pageCount: 2 };
    const pageTwo: ToyList = {
      toys: [{ ...toy, slug: "second-toy", title: "Second toy" }],
      page: 2,
      pageCount: 2,
    };
    const list = vi
      .fn<ToyRepository["list"]>()
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce(pageTwo)
      .mockResolvedValueOnce(pageOne);
    render(BrowsePage, { toyRepository: repository(list) });

    expect(await screen.findByText("Quiet cube")).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    await fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Second toy")).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(1));
    expect(await screen.findByText("Quiet cube")).toBeInTheDocument();
  });
});
