// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import TextureInputs from "./TextureInputs.svelte";
import { reconcileTextureSlots, type TextureSlot } from "./texture-inputs";

const slots: TextureSlot[] = [
  {
    declaration: {
      name: "grass",
      width: 32,
      height: 32,
      format: "RGBA16",
      line: 4,
    },
    asset: {
      previewUrl: "blob:grass",
      png: new Blob([], { type: "image/png" }),
      rgba: new Uint8Array(32 * 32 * 4),
      width: 32,
      height: 32,
    },
  },
  {
    declaration: {
      name: "mask",
      width: 32,
      height: 32,
      format: "IA8",
      line: 8,
    },
  },
];

describe("TextureInputs", () => {
  it("renders declaration-keyed upload and remove controls", async () => {
    const onupload = vi.fn();
    const onremove = vi.fn();
    render(TextureInputs, { slots, onupload, onremove });

    expect(screen.getByText("grass · 32x32 · RGBA16")).toBeInTheDocument();
    expect(screen.getByText("mask · 32x32 · IA8")).toBeInTheDocument();
    const grassInput = screen.getByLabelText("upload grass texture");
    expect(grassInput).toHaveClass("sr-only");
    expect(grassInput).not.toHaveClass("hidden");
    grassInput.focus();
    expect(grassInput).toHaveFocus();
    expect(grassInput.closest("label")).toHaveClass(
      "focus-within:outline-n64-blue",
    );
    const maskInput = screen.getByLabelText("upload mask texture");

    const mask = new File(["mask"], "mask.png", { type: "image/png" });
    await fireEvent.change(maskInput, { target: { files: [mask] } });
    expect(onupload).toHaveBeenCalledWith("mask", mask);

    await fireEvent.click(
      screen.getByRole("button", { name: "remove grass texture" }),
    );
    expect(onremove).toHaveBeenCalledWith("grass");
    expect(
      screen.queryByRole("button", { name: "remove mask texture" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("upload texture")).not.toBeInTheDocument();
    expect(screen.queryByText("+")).not.toBeInTheDocument();
  });

  it("handles a rejected upload and displays its named inline error", async () => {
    const onupload = vi
      .fn()
      .mockRejectedValue(new Error("invalid PNG signature"));
    const erroredSlots: TextureSlot[] = [
      { ...slots[0], uploadError: "texture file has an invalid PNG signature" },
    ];
    render(TextureInputs, {
      slots: erroredSlots,
      onupload,
      onremove: vi.fn(),
    });
    const replacement = new File(["bad"], "bad.png", { type: "image/png" });

    await fireEvent.change(screen.getByLabelText("upload grass texture"), {
      target: { files: [replacement] },
    });

    expect(onupload).toHaveBeenCalledWith("grass", replacement);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "texture file has an invalid PNG signature",
    );
    expect(screen.getByAltText("grass texture preview")).toHaveAttribute(
      "src",
      "blob:grass",
    );
  });

  it("renders one keyed card for duplicate declaration names", () => {
    const duplicate = {
      ...slots[0].declaration,
      format: "IA8",
      line: 12,
    };
    const reconciled = reconcileTextureSlots(slots, [
      slots[0].declaration,
      duplicate,
    ]);

    render(TextureInputs, {
      slots: reconciled.slots,
      onupload: vi.fn(),
      onremove: vi.fn(),
    });

    expect(screen.getAllByLabelText("upload grass texture")).toHaveLength(1);
    expect(screen.getByText("grass · 32x32 · RGBA16")).toBeInTheDocument();
  });

  it("shows a removable binary placeholder instead of a broken preview", async () => {
    const onremove = vi.fn();
    const binarySlots: TextureSlot[] = [
      {
        ...slots[0],
        asset: {
          ...slots[0].asset!,
          previewUrl: "blob:binary",
          png: new Blob([new Uint8Array([1, 2, 3])], {
            type: "application/octet-stream",
          }),
        },
      },
    ];
    render(TextureInputs, {
      slots: binarySlots,
      onupload: vi.fn(),
      onremove,
    });

    expect(
      screen.queryByAltText("grass texture preview"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("binary loaded")).toBeInTheDocument();
    expect(screen.getByText("replace PNG")).toBeInTheDocument();
    expect(screen.getByLabelText("upload grass texture")).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole("button", { name: "remove grass texture" }),
    );
    expect(onremove).toHaveBeenCalledWith("grass");
  });

  it("renders plain guidance when source declares no textures", () => {
    render(TextureInputs, { slots: [], onupload: vi.fn(), onremove: vi.fn() });

    const guidance = screen.getByText(
      "declare a Texture in source to add an input",
    );
    expect(guidance).toBeInTheDocument();
    expect(guidance).toHaveClass("p-3");
    expect(guidance).not.toHaveClass("border");
  });
});
