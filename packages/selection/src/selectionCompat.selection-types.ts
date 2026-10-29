import type { EntityRaw } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

interface SelectionNode extends EntityRaw {
  readonly data: EntityRaw | null;
  enabled: boolean;
  kind: string;
  name: string | null;
}

/** Opaque freeform gesture state created and updated by @flighthq/selection. */
export interface LassoSelection extends EntityRaw {}

/** Opaque rubber-band gesture state created and updated by @flighthq/selection. */
export interface MarqueeSelection extends EntityRaw {}

export type MarqueeSelectionMode = 'contain' | 'intersect';

export interface SelectionModifierState {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface SelectionSignals<NodeType extends SelectionNode = SelectionNode> {
  onActiveChange: Signal<NodeType | null>;
  onChange: Signal<readonly NodeType[]>;
}

declare const SelectionStateNodeTypeKey: unique symbol;

/** Ordered node selection. Its contents are mutated only through @flighthq/selection functions. */
export interface SelectionState<NodeType extends SelectionNode = SelectionNode> extends EntityRaw {
  readonly [SelectionStateNodeTypeKey]?: NodeType;
}
