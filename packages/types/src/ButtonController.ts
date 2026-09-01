import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { NodeInteractiveStateBinding } from './NodeInteractiveStateBinding';
import type { Signal } from './Signal';

declare const ButtonControllerTypeKey: unique symbol;

export interface ButtonController extends Entity {
  readonly [ButtonControllerTypeKey]?: void;
}

export interface ButtonControllerOptions extends GuiControllerOptions {
  disabled?: boolean;
  downState?: Node2D;
  hitArea?: Node2D;
  // The controller explicitly drives and disposes this visual-state binding from its existing pointer
  // lifecycle; the binding itself installs no listeners and owns no behavior.
  interactiveStateBinding?: NodeInteractiveStateBinding;
  overState?: Node2D;
  upState: Node2D;
}

export interface ButtonControllerSignals {
  onClick: Signal<() => void>;
  onPress: Signal<() => void>;
  onRelease: Signal<() => void>;
}
