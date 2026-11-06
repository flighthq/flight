import type { NodeInteractiveStateTransition } from '@flighthq/interaction/contract';

import type { FlightDocumentFields } from './FlightDocumentFieldSchema.ts';

/** @deprecated Import interaction contracts from `@flighthq/interaction/contract`. */
export type {
  NodeInteractiveStateBinding,
  NodeInteractiveStateBindingRuntime,
  NodeInteractiveStateExplanation,
  NodeInteractiveStateFlags,
  NodeInteractiveStateProperty,
  NodeInteractiveStateTransition,
  NodeInteractiveStateTransitionRequest,
  NodeInteractiveStateTransitionValue,
} from '@flighthq/interaction/contract';

/** @deprecated Import interaction contracts from `@flighthq/interaction/contract`. */
export const NodeInteractiveStateRefusalReason = {
  ExtensionCreationFailed: 'node-interactive-state.extension.creation-failed',
  ExtensionKindUnregistered: 'node-interactive-state.extension-kind.unregistered',
  ExtensionTargetUnsupported: 'node-interactive-state.extension.target-unsupported',
  PropertyTargetUnsupported: 'node-interactive-state.property.target-unsupported',
  TransitionCreationFailed: 'node-interactive-state.transition.creation-failed',
  TransitionKindUnregistered: 'node-interactive-state.transition-kind.unregistered',
} as const;

/** @deprecated Import interaction contracts from `@flighthq/interaction/contract`. */
export type NodeInteractiveStateRefusalReason =
  (typeof NodeInteractiveStateRefusalReason)[keyof typeof NodeInteractiveStateRefusalReason];

// This is the single scene-document-shaped cycle seam: Interaction executes the runtime, while its
// field payload is owned by Scene Document. The compatibility bridge keeps the two owner contracts
// from importing each other's full package surface.
export interface NodeInteractiveStateExtensionRuntime {
  apply: (
    fields: Readonly<FlightDocumentFields>,
    transition: Readonly<NodeInteractiveStateTransition> | null,
  ) => boolean;
  capture: (out: FlightDocumentFields) => boolean;
  dispose: () => void;
}
