// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import HelpDrawer from "./HelpDrawer.svelte";

describe("HelpDrawer", () => {
  it("renders nothing when closed", () => {
    render(HelpDrawer, { open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has a visible close button that reports the close", async () => {
    const onclose = vi.fn();
    render(HelpDrawer, { open: true, onclose });
    await fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onclose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onclose = vi.fn();
    render(HelpDrawer, { open: true, onclose });
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onclose).toHaveBeenCalled();
  });

  it("documents the declarations a first toy needs", () => {
    render(HelpDrawer, { open: true });
    const dialog = screen.getByRole("dialog");
    for (const fragment of [
      "Vtx { x, y, z, flag, s, t, r, g, b, a }",
      "Vp { vscale0..3, vtrans0..3 }",
      "Texture <name> = { width, height, FMT }",
    ]) {
      expect(dialog.textContent).toContain(fragment);
    }
    // `verts` and `vp` are the implicit pool names the commands refer to.
    expect(dialog.textContent).toContain("verts");
    expect(dialog.textContent).toContain("time");
  });

  it("external links open in new tabs with noopener", () => {
    render(HelpDrawer, { open: true });
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
    }
  });

  it("copies the mini example to the clipboard", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(HelpDrawer, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalled();
    expect(writeText.mock.calls[0][0]).toContain("gsSPEndDisplayList()");
    vi.unstubAllGlobals();
  });
});
