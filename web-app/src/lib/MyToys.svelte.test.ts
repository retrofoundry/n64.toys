// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToyRepository } from "../toys/repository";
import type { ToyList, ToySummary } from "../toys/types";
import MyToys from "./MyToys.svelte";

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

function repository(listMine: ToyRepository["listMine"]): ToyRepository {
  return {
    list: vi.fn(async (page = 1) => ({ toys: [], page, pageCount: 0 })),
    listMine,
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
  visibility: "private",
  microcode: "F3DEX2",
  owner: { id: "user-1", displayName: "Ada Hopper" },
  thumbnailUrl: "/api/toys/quiet-cube/thumbnail",
  forkOf: null,
  isOwner: true,
  createdAt: "2026-07-22T12:00:00.000Z",
};

const empty: ToyList = { toys: [], page: 1, pageCount: 0 };

describe("MyToys", () => {
  beforeEach(() => history.replaceState(null, "", "/#mine"));

  it("fetches only when active and refetches on reactivation (no stale list)", async () => {
    const listMine = vi.fn(async () => empty);
    const repo = repository(listMine);
    const { rerender } = render(MyToys, { toyRepository: repo, active: false });
    expect(listMine).not.toHaveBeenCalled();

    await rerender({ toyRepository: repo, active: true });
    await waitFor(() => expect(listMine).toHaveBeenCalledTimes(1));

    await rerender({ toyRepository: repo, active: false });
    await rerender({ toyRepository: repo, active: true });
    await waitFor(() => expect(listMine).toHaveBeenCalledTimes(2));
  });

  it("moves from loading to a friendly empty state", async () => {
    const request = deferred<ToyList>();
    render(MyToys, { toyRepository: repository(() => request.promise) });

    expect(screen.getByRole("status")).toHaveTextContent("loading your toys");
    request.resolve(empty);

    expect(
      await screen.findByText("You haven't saved any toys yet."),
    ).toBeInTheDocument();
  });

  it("turns repository failures, including signed-out responses, into a sign-in prompt", async () => {
    const listMine = vi.fn().mockRejectedValue(new Error("status 401 private detail"));
    render(MyToys, { toyRepository: repository(listMine) });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign in to see your toys.",
    );
    expect(screen.queryByText(/401 private detail/)).not.toBeInTheDocument();
  });

  it("renders visibility badges and paginates within the available pages", async () => {
    const pageOne: ToyList = { toys: [toy], page: 1, pageCount: 2 };
    const pageTwo: ToyList = {
      toys: [
        {
          ...toy,
          slug: "shared-toy",
          title: "Shared toy",
          visibility: "unlisted",
        },
      ],
      page: 2,
      pageCount: 2,
    };
    const listMine = vi
      .fn<ToyRepository["listMine"]>()
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce(pageTwo)
      .mockResolvedValueOnce(pageOne);
    render(MyToys, { toyRepository: repository(listMine) });

    expect(await screen.findByText("Quiet cube")).toBeInTheDocument();
    expect(screen.getByText("private")).toBeInTheDocument();
    expect(listMine).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    await fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Shared toy")).toBeInTheDocument();
    expect(screen.getByText("unlisted")).toBeInTheDocument();
    expect(listMine).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(listMine).toHaveBeenLastCalledWith(1));
    expect(await screen.findByText("Quiet cube")).toBeInTheDocument();
  });
});
