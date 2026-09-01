import type { Entity, EntityRuntime } from './Entity';
import type { FlightDocumentFields } from './FlightDocumentFieldSchema';
import type { NodeAny } from './Node';

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

export type NodeInteractiveStateTransitionValue = boolean | number;

export interface NodeInteractiveStateTransitionRequest<N extends NodeAny = NodeAny, P extends string = string> {
  readonly apply: (value?: NodeInteractiveStateTransitionValue) => void;
  readonly from: NodeInteractiveStateTransitionValue;
  readonly property: P;
  readonly target: N;
  readonly value: NodeInteractiveStateTransitionValue;
}

export interface NodeInteractiveStateTransition<N extends NodeAny = NodeAny, P extends string = string> {
  readonly run: (request: Readonly<NodeInteractiveStateTransitionRequest<N, P>>) => void;
}

export interface NodeInteractiveStateExtensionRuntime {
  apply: (
    fields: Readonly<FlightDocumentFields>,
    transition: Readonly<NodeInteractiveStateTransition> | null,
  ) => boolean;
  capture: (out: FlightDocumentFields) => boolean;
  dispose: () => void;
}

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
