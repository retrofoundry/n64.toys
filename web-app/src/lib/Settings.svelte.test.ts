// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";
import { Playground } from "./playground.svelte";
import Settings from "./Settings.svelte";

it("selects F3D through the microcode control", async () => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  const pg = new Playground();
  const calls: string[] = [];
  const reconcile = vi
    .spyOn(pg, "reconcileTextureDeclarations")
    .mockImplementation(() => calls.push(`analyze:${pg.settings.microcode}`));
  const run = vi
    .spyOn(pg, "run")
    .mockImplementation(() => calls.push(`render:${pg.settings.microcode}`));
  render(Settings, { pg });

  await fireEvent.pointerDown(screen.getByRole("button", { name: "Microcode" }));
  const option = screen.getByRole("option", { name: /^F3D$/ });
  await fireEvent.pointerDown(option);
  await fireEvent.pointerUp(option);

  expect(pg.settings.microcode).toBe("F3D");
  expect(reconcile).toHaveBeenCalledOnce();
  expect(run).toHaveBeenCalledOnce();
  expect(calls).toEqual(["analyze:F3D", "render:F3D"]);
});
