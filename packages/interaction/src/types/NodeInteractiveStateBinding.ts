import type { EntityRuntime } from '@flighthq/entity/contract';

import type { InteractionEntity as Entity } from './InteractionEntity.ts';

declare const NodeInteractiveStateBindingBrand: unique symbol;

export interface NodeInteractiveStateBinding extends Entity {
  readonly [NodeInteractiveStateBindingBrand]: true;
}

export interface NodeInteractiveStateBindingRuntime extends EntityRuntime {
  disposed: boolean;
}

export interface NodeInteractiveStateFlags {
  disabled: boolean;
  hovered: boolean;
  pressed: boolean;
}

export type NodeInteractiveStateProperty = 'alpha' | 'scaleX' | 'scaleY' | 'visible' | 'x' | 'y';

// The transition callback shapes are owned by Scene Document, whose document fields drive them;
// Interaction republishes them on its contract because its binding runtime executes them.
export type {
  NodeInteractiveStateTransition,
  NodeInteractiveStateTransitionRequest,
  NodeInteractiveStateTransitionValue,
} from '@flighthq/scene-document/contract';

export const NodeInteractiveStateRefusalReason = {
  ExtensionCreationFailed: 'node-interactive-state.extension.creation-failed',
  ExtensionKindUnregistered: 'node-interactive-state.extension-kind.unregistered',
  ExtensionTargetUnsupported: 'node-interactive-state.extension.target-unsupported',
  PropertyTargetUnsupported: 'node-interactive-state.property.target-unsupported',
  TransitionCreationFailed: 'node-interactive-state.transition.creation-failed',
  TransitionKindUnregistered: 'node-interactive-state.transition-kind.unregistered',
} as const;

export type NodeInteractiveStateRefusalReason =
  (typeof NodeInteractiveStateRefusalReason)[keyof typeof NodeInteractiveStateRefusalReason];

export interface NodeInteractiveStateExplanation {
  kind: string;
  property?: NodeInteractiveStateProperty;
  reason: NodeInteractiveStateRefusalReason;
}
