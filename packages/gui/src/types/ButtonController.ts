import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';
import type { NodeInteractiveStateBinding } from './GuiNodeInteractiveState.ts';

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
  onClick: Signal<void>;
  onPress: Signal<void>;
  onRelease: Signal<void>;
}
