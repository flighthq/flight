// Generated from crates/flight-selection/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EntityRaw } from '@flighthq/entity/contract';
import type { Rectangle } from '@flighthq/geometry/contract';
import type { NodeRef } from '@flighthq/node/contract';
import type { Path } from '@flighthq/path/contract';

import type { SelectionSignals } from './selectionCompatTypes.ts';

/**
 * Whether a marquee accepts intersecting bounds or only fully enclosed bounds.
 */
export enum MarqueeSelectionModeRaw {
  Contain = 'contain',
  Intersect = 'intersect',
}

/**
 * Opaque freeform gesture state (TS `LassoSelection`).
 */
export interface LassoSelectionRaw extends EntityRaw {}

/**
 * The private lasso gesture runtime tier (TS `LassoSelectionRuntime`).
 */
export interface LassoSelectionRuntime {
  active: boolean;
  path: Path;
}

/**
 * Opaque rubber-band gesture state (TS `MarqueeSelection`).
 */
export interface MarqueeSelectionRaw extends EntityRaw {}

/**
 * The private marquee gesture runtime tier (TS `MarqueeSelectionRuntime`).
 */
export interface MarqueeSelectionRuntime {
  active: boolean;
  rectangle: Rectangle;
  startX: number;
  startY: number;
}

/**
 * Pointer modifiers consumed by the base selection policy.
 */
export interface SelectionModifierStateRaw {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Ordered node selection. Contents are mutated only through this crate's functions.
 */
export interface SelectionStateRaw extends EntityRaw {}

/**
 * The private ordered-selection runtime tier (TS `SelectionStateRuntime`).
 */
export interface SelectionStateRuntime {
  activeNode: NodeRef | null;
  selectedNodeSet: NodeRef[];
  selectedNodes: NodeRef[];
  signals: SelectionSignals;
}

// Crate-private `LassoSelection.state`, keyed by entity identity and reachable only from this package's modules.
const lassoSelectionStateStore = /* @__PURE__ */ new WeakMap<Readonly<LassoSelectionRaw>, LassoSelectionRuntime>();

export { lassoSelectionStateStore };

// Crate-private `MarqueeSelection.state`, keyed by entity identity and reachable only from this package's modules.
const marqueeSelectionStateStore = /* @__PURE__ */ new WeakMap<
  Readonly<MarqueeSelectionRaw>,
  MarqueeSelectionRuntime
>();

export { marqueeSelectionStateStore };

// Crate-private `SelectionState.state`, keyed by entity identity and reachable only from this package's modules.
const selectionStateStateStore = /* @__PURE__ */ new WeakMap<Readonly<SelectionStateRaw>, SelectionStateRuntime>();

export { selectionStateStateStore };
