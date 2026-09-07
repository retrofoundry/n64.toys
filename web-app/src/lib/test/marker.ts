import Marker from "./Marker.svelte";

type Component = (anchor: Node, props: Record<string, unknown>) => unknown;

export function marker(testid: string, capture?: (props: Record<string, unknown>) => void): Component {
  return (anchor, props) => {
    capture?.(props);
    return (Marker as unknown as Component)(anchor, { ...props, testid });
  };
}
