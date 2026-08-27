import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { Signal } from './Signal';

declare const ToggleControllerTypeKey: unique symbol;

export interface ToggleController extends Entity {
  readonly [ToggleControllerTypeKey]?: void;
}

export interface ToggleControllerOptions extends GuiControllerOptions {
  checked?: boolean;
  checkedState: Node2D;
  label?: Node2D;
  overState?: Node2D;
  uncheckedState: Node2D;
}

export interface ToggleControllerSignals {
  onChange: Signal<(checked: boolean) => void>;
}
