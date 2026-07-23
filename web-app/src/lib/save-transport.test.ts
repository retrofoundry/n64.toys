import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpSaveTransport } from "./save-transport";

afterEach(() => vi.unstubAllGlobals());

describe("HttpSaveTransport", () => {
  it("creates a toy with multipart data and maps the created slug", async () => {
    const body = new FormData();
    const fetch = vi.fn(async () =>
      Response.json({ slug: "new-toy" }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(new HttpSaveTransport().create(body)).resolves.toEqual({
      ok: true,
      value: { slug: "new-toy" },
    });
    expect(fetch).toHaveBeenCalledWith("/api/toys", {
      method: "POST",
      body,
      credentials: "include",
    });
  });

  it("updates the selected toy", async () => {
    const body = new FormData();
    const fetch = vi.fn(async () => Response.json({ slug: "saved-toy" }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      new HttpSaveTransport().update("saved-toy", body),
    ).resolves.toEqual({ ok: true, value: { slug: "saved-toy" } });
    expect(fetch).toHaveBeenCalledWith("/api/toys/saved-toy", {
      method: "PUT",
      body,
      credentials: "include",
    });
  });

  it("deletes the selected toy", async () => {
    const fetch = vi.fn(async () => Response.json({ slug: "saved toy" }));
    vi.stubGlobal("fetch", fetch);

    await expect(new HttpSaveTransport().delete("saved toy")).resolves.toEqual({
      ok: true,
      value: { slug: "saved toy" },
    });
    expect(fetch).toHaveBeenCalledWith("/api/toys/saved%20toy", {
      method: "DELETE",
      credentials: "include",
    });
  });

  it.each([
    [400, "validation_error", "validation"],
    [400, "quota_exceeded", "quota"],
    [404, "not_found", "not_found"],
    [403, "forbidden", "forbidden"],
    [409, "conflict", "conflict"],
    [500, "storage_error", "storage"],
  ] as const)(
    "maps HTTP %i / %s errors to %s service errors",
    async (status, code, kind) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(
            { error: { code, message: "Safe response message" } },
            { status },
          ),
        ),
      );

      await expect(
        new HttpSaveTransport().create(new FormData()),
      ).resolves.toEqual({
        ok: false,
        error: { kind, message: "Safe response message" },
      });
    },
  );
});
