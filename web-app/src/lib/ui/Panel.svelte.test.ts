// @vitest-environment jsdom

import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";

import Panel from "./Panel.svelte";

const body = createRawSnippet(() => ({ render: () => "<p>panel body</p>" }));
const actions = createRawSnippet(() => ({ render: () => "<button>panel action</button>" }));

describe("Panel", () => {
  it("renders a labelled region with optional actions and body content", () => {
    render(Panel, { title: "Diagnostics", actions, children: body });

    expect(screen.getByRole("region", { name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "panel action" })).toBeInTheDocument();
    expect(screen.getByText("panel body")).toBeInTheDocument();
  });
});
