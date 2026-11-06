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

/** @deprecated Import from `@flighthq/scene-document/contract`. */
export type { NodeInteractiveStateExtensionRuntime } from '@flighthq/scene-document/contract';
