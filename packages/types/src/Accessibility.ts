import type { Entity } from './Entity';
import type { Rectangle } from './Rectangle';

// Assistive-technology bridge seam — the Flight home for exposing a canvas/game UI's semantics
// (roles, labels, states, focus) to screen readers, which otherwise see only an opaque surface. The
// backend holds the mirrored node tree; callers pass the Host that owns it to every command.

// An ARIA role. Open union: the well-known roles plus any string, so a vendor or native host can use
// a custom (vendor-prefixed) role. The `(string & {})` arm preserves autocomplete for the known
// roles while still accepting any string.
export type AccessibilityRole =
  | 'button'
  | 'checkbox'
  | 'radio'
  | 'slider'
  | 'heading'
  | 'textbox'
  | 'link'
  | 'image'
  | 'list'
  | 'listitem'
  | 'dialog'
  | 'menu'
  | 'menuitem'
  | 'tab'
  | 'tabpanel'
  | 'progressbar'
  | 'group'
  | 'region'
  | 'none'
  | (string & {});

// Announcement urgency for a live region: 'polite' waits for the current speech to finish,
// 'assertive' interrupts. Mirrors the ARIA aria-live values.
export type AccessibilityLiveness = 'polite' | 'assertive';

// The dynamic state of an accessibility node. Booleans map to their ARIA state attribute
// (aria-disabled/checked/…); the numerics carry the range and heading semantics ARIA needs
// (aria-level, aria-valuemin/max/now). Every field is optional — a node declares only the states its
// role uses. All fields absent means no state attributes are reflected.
export interface AccessibilityState {
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  selected?: boolean;
  pressed?: boolean;
  busy?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  required?: boolean;
  level?: number;
  valueMin?: number;
  valueMax?: number;
  valueNow?: number;
}

// A plain-data accessibility node: what an interactive element IS (role/label/state), its text
// value, where it is (bounds, for hosts that position an overlay), and its place in the tree
// (parentId). Keyed by `id`; a node with no `parentId` sits at the tree root. `bounds` is optional
// and in the app's own coordinate space — accessibility does not read the scene graph, the caller
// maps its UI onto nodes.
export interface AccessibilityNode {
  id: string;
  role: AccessibilityRole;
  label?: string;
  description?: string;
  value?: string;
  parentId?: string;
  bounds?: Readonly<Rectangle>;
  states?: Readonly<AccessibilityState>;
}

export type AccessibilityOperationBlockReason = 'destroyed' | 'focus-not-moved' | 'no-dom' | 'node-not-found';

// Plain result data from a selected provider. The reason is the sole discriminant: operation-specific
// signatures below exclude reasons an operation cannot produce.
export type AccessibilityOperationOutcome<
  BlockReason extends AccessibilityOperationBlockReason = AccessibilityOperationBlockReason,
> = { readonly reason: 'ok' } | { readonly reason: BlockReason };

// The assistive-technology command provider. It is an Entity because it owns the mirrored tree and
// provider lifecycle. destroy is terminal and idempotent; later operations report `destroyed`.
export interface AccessibilityBackend extends Entity {
  announce(message: string, liveness: AccessibilityLiveness): AccessibilityOperationOutcome<'destroyed' | 'no-dom'>;
  clear(): AccessibilityOperationOutcome<'destroyed' | 'no-dom'>;
  destroy(): void;
  removeNode(id: string): AccessibilityOperationOutcome<'destroyed' | 'no-dom' | 'node-not-found'>;
  setFocus(id: string): AccessibilityOperationOutcome<'destroyed' | 'focus-not-moved' | 'no-dom' | 'node-not-found'>;
  setNode(node: Readonly<AccessibilityNode>): AccessibilityOperationOutcome<'destroyed' | 'no-dom'>;
}
