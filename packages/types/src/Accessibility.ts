import type { Rectangle } from './Rectangle';

// Assistive-technology (ARIA) bridge seam — the Flight home for exposing a canvas/game UI's
// semantics (roles, labels, states, focus) to screen readers, which otherwise see only an opaque
// <canvas>. Free functions in @flighthq/accessibility delegate to the active AccessibilityBackend
// (a visually-hidden ARIA DOM overlay on web, native accessibility APIs on native hosts). The
// backend HOLDS the mirrored node tree; the app issues node/focus/announce commands. This is a
// command capability, sentinels not throws — a missing/unfocusable target is `false`, and with no
// DOM present every method is a no-op rather than an error.

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

// The assistive-technology seam realized by the web default (createWebAccessibilityBackend) and by
// native hosts. The backend owns the mirrored node tree; @flighthq/accessibility's free functions
// dispatch every command through it. `setFocus` returns whether focus moved; the others are
// commands. Implementations return sentinels (no-op, `false`) rather than throwing.
export interface AccessibilityBackend {
  setNode(node: Readonly<AccessibilityNode>): void;
  removeNode(id: string): void;
  clear(): void;
  setFocus(id: string): boolean;
  announce(message: string, liveness: AccessibilityLiveness): void;
}
