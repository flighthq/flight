import type { Node2D } from './Node2D';
import type {
  NodeInteractiveStateProperty,
  NodeInteractiveStateTransition,
  NodeInteractiveStateTransitionRequest,
  NodeInteractiveStateTransitionValue,
} from './NodeInteractiveStateBinding';

export type GuiOrientation = 'horizontal' | 'vertical';

export type GuiTransitionProperty = NodeInteractiveStateProperty;

export type GuiTransitionValue = NodeInteractiveStateTransitionValue;

// A controller creates one request for each user-visible property change. Calling apply with no
// argument writes the requested final value; an adapter may call it repeatedly with intermediate
// values from any animation system. This inversion keeps animation opt-in and keeps @flighthq/gui
// independent of a particular tween implementation.
export type GuiTransitionRequest = NodeInteractiveStateTransitionRequest<Node2D, GuiTransitionProperty>;

export type GuiTransitionDescriptor = NodeInteractiveStateTransition<Node2D, GuiTransitionProperty>;

export interface GuiControllerOptions {
  transition?: Readonly<GuiTransitionDescriptor>;
}
