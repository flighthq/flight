import type { NodeAny } from './Node';

/**
 * Payload for the node focus signals `onFocusIn` / `onFocusOut`. Mirrors the DOM `FocusEvent` shape in
 * Flight's plain-data idiom: `target` is the node the focus change is about, `currentTarget` is the node
 * whose handler is firing as the signal bubbles up the ancestor chain, and `relatedTarget` is the node on
 * the other side of the change — the node losing focus on an `onFocusIn`, or the node gaining it on an
 * `onFocusOut`, or `null` when focus enters from / leaves to nothing.
 *
 * Reused (like `PointerEventData`) as a single mutable instance across a dispatch, so a slot must read the
 * fields it needs synchronously rather than retaining the object.
 */
export interface FocusEventData {
  currentTarget: NodeAny | null;
  relatedTarget: NodeAny | null;
  target: NodeAny | null;
}
