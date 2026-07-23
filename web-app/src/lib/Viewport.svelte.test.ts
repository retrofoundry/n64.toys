// @vitest-environment jsdom

import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Viewport from "./Viewport.svelte";

describe("Viewport", () => {
  it("labels the viewport region and render output", () => {
    const pg = { settings: { microcode: "F3DEX2" }, status: "ready", errored: false, isAnimated: false };
    render(Viewport, { pg: pg as never });
    expect(screen.getByRole("region", { name: "viewport" })).toBeInTheDocument();
    expect(screen.getByLabelText("N64 render output")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
