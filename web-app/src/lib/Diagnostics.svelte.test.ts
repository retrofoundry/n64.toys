// @vitest-environment jsdom

import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Diagnostics from "./Diagnostics.svelte";

describe("Diagnostics", () => {
  it("exposes an explicit successful diagnostics region", () => {
    render(Diagnostics, { diagnostics: [] });
    expect(screen.getByRole("region", { name: "diagnostics" })).toBeInTheDocument();
    expect(screen.getByText("no diagnostics")).toBeInTheDocument();
  });

  it("labels diagnostic failures with text and location", () => {
    render(Diagnostics, { diagnostics: [{ line: 7, msg: "unknown macro" }] });
    expect(screen.getByText("line 7")).toBeInTheDocument();
    expect(screen.getByText("unknown macro")).toBeInTheDocument();
  });
});
