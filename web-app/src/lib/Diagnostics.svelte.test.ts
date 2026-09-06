// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Diagnostics from "./Diagnostics.svelte";

describe("Diagnostics", () => {
  it("exposes an explicit successful diagnostics region", () => {
    render(Diagnostics, { diagnostics: [] });
    expect(
      screen.getByRole("region", { name: "diagnostics" }),
    ).toBeInTheDocument();
    expect(screen.getByText("no diagnostics")).toBeInTheDocument();
  });

  it("labels diagnostic failures with text and location", () => {
    render(Diagnostics, {
      diagnostics: [
        {
          line: 7,
          kind: "src",
          severity: "error" as const,
          msg: "unknown macro",
        },
      ],
    });
    expect(screen.getByText("line 7")).toBeInTheDocument();
    expect(screen.getByText("unknown macro")).toBeInTheDocument();
  });

  it("renders address diagnostics as hex addresses, not lines", () => {
    render(Diagnostics, {
      diagnostics: [
        {
          line: 0x1234,
          kind: "addr",
          severity: "error" as const,
          msg: "unknown opcode 0xAB",
        },
      ],
    });
    expect(screen.getByText(/addr 0x1234/i)).toBeTruthy();
  });
});

it("colors warnings yellow and errors red even at the same location", () => {
  render(Diagnostics, {
    diagnostics: [
      { line: 1, kind: "src", severity: "warn", msg: "diagnostic" },
      { line: 1, kind: "src", severity: "error", msg: "diagnostic" },
    ],
  });
  const messages = screen.getAllByText("diagnostic");
  expect(messages[0].parentElement).toHaveClass("border-l-n64-yellow");
  expect(messages[1].parentElement).toHaveClass("border-l-n64-red");
});

it("offers diagnostic navigation with the original diagnostic", async () => {
  const diagnostic = {line:27,kind:"src" as const,severity:"warn" as const,msg:"render mode missing"};
  const onselect = vi.fn();
  render(Diagnostics,{diagnostics:[diagnostic],onselect});
  await fireEvent.click(screen.getByRole("button",{name:"render mode missing"}));
  expect(onselect).toHaveBeenCalledExactlyOnceWith(diagnostic);
});
