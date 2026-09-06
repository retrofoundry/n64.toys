// @vitest-environment jsdom
import { render } from "@testing-library/svelte";
import { EditorView } from "@codemirror/view";
import { expect, it, vi } from "vitest";
import Editor from "./Editor.svelte";
import { inspectionField } from "./editor/inspection";

it("wires real editor navigation, cursor callbacks and immediate edit clearing", async () => {
  const oncursorline = vi.fn();
  const oninput = vi.fn();
  const props = {value:"first\nsecond\nthird",diagnostics:[],onrun:vi.fn(),oninput,oncursorline,inspectionLine:2,inspectionNavigation:1};
  const component = render(Editor, props);
  let view: EditorView;
  await vi.waitFor(() => {
    view = EditorView.findFromDOM(component.container.querySelector(".cm-editor")!)!;
    expect(view.state.selection.main.head).toBe(6);
  });
  expect(oncursorline).not.toHaveBeenCalled();
  expect(view!.state.field(inspectionField).size).toBe(1);
  view!.dispatch({selection:{anchor:13}});
  expect(oncursorline).toHaveBeenCalledWith(3);
  view!.dispatch({changes:{from:0,insert:"edit"}});
  expect(oninput).toHaveBeenCalledOnce();
  expect(view!.state.field(inspectionField).size).toBe(0);
  await component.rerender({...props,value:"replacement\nsource",inspectionLine:null,inspectionNavigation:1});
  expect(view!.state.doc.toString()).toBe("replacement\nsource");
  expect(view!.state.field(inspectionField).size).toBe(0);
});
