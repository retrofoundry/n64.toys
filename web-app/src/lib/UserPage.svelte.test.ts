// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToyRepository } from "../toys/repository";
import type { ToySummary, UserToys } from "../toys/types";
import UserPage from "./UserPage.svelte";

function repository(
  listUserPublic: ToyRepository["listUserPublic"],
): ToyRepository {
  return {
    list: vi.fn(async (page = 1) => ({ toys: [], page, pageCount: 0 })),
    listMine: vi.fn(async (page = 1) => ({ toys: [], page, pageCount: 0 })),
    listUserPublic,
    get: vi.fn(async () => null),
  };
}

const toy: ToySummary = {
  slug: "quiet-cube",
  title: "Quiet cube",
  description: "A small cube",
  visibility: "public",
  microcode: "F3DEX2",
  owner: { id: "author123", displayName: "Ada Hopper" },
  thumbnailUrl: "/api/toys/quiet-cube/thumbnail",
  forkOf: null,
  isOwner: false,
  createdAt: "2026-07-22T12:00:00.000Z",
};

function page(
  overrides: Partial<UserToys> = {},
): UserToys {
  return {
    owner: toy.owner,
    toys: [toy],
    page: 1,
    pageCount: 1,
    ...overrides,
  };
}

describe("UserPage", () => {
  beforeEach(() => history.replaceState(null, "", "/#u=author123"));

  it("loads only when active and reloads page one for a changed user", async () => {
    const listUserPublic = vi.fn(async (userId: string) =>
      page({
        owner: { id: userId, displayName: userId },
        toys: [],
      }),
    );
    const repo = repository(listUserPublic);
    const { rerender } = render(UserPage, {
      userId: "author123",
      toyRepository: repo,
      active: false,
    });
    expect(listUserPublic).not.toHaveBeenCalled();

    await rerender({
      userId: "author123",
      toyRepository: repo,
      active: true,
    });
    await waitFor(() =>
      expect(listUserPublic).toHaveBeenLastCalledWith("author123", 1),
    );

    await rerender({
      userId: "other456",
      toyRepository: repo,
      active: true,
    });
    await waitFor(() =>
      expect(listUserPublic).toHaveBeenLastCalledWith("other456", 1),
    );
  });

  it("shows the owner heading and friendly public-toy empty state", async () => {
    render(UserPage, {
      userId: "author123",
      toyRepository: repository(async () => page({ toys: [] })),
    });

    expect(
      await screen.findByRole("heading", { name: "Toys by Ada Hopper" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ada Hopper has no public toys yet."),
    ).toBeInTheDocument();
  });

  it("turns a rejected user lookup into a not-found state", async () => {
    render(UserPage, {
      userId: "missing",
      toyRepository: repository(async () => {
        throw new Error("status 404 private detail");
      }),
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This user could not be found.",
    );
    expect(screen.queryByText(/404 private detail/)).not.toBeInTheDocument();
  });

  it("renders public cards without visibility badges and paginates within bounds", async () => {
    const pageOne = page({ pageCount: 2 });
    const pageTwo = page({
      toys: [{ ...toy, slug: "second-toy", title: "Second toy" }],
      page: 2,
      pageCount: 2,
    });
    const listUserPublic = vi
      .fn<ToyRepository["listUserPublic"]>()
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce(pageTwo)
      .mockResolvedValueOnce(pageOne);
    render(UserPage, {
      userId: "author123",
      toyRepository: repository(listUserPublic),
    });

    expect(await screen.findByText("Quiet cube")).toBeInTheDocument();
    expect(screen.queryByText("public")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();

    await fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Second toy")).toBeInTheDocument();
    expect(listUserPublic).toHaveBeenLastCalledWith("author123", 2);
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await fireEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    await waitFor(() =>
      expect(listUserPublic).toHaveBeenLastCalledWith("author123", 1),
    );
  });
});
