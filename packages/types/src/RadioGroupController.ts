import type { Entity } from './Entity';
import type { Signal } from './Signal';
import type { ToggleController } from './ToggleController';

declare const RadioGroupControllerTypeKey: unique symbol;

export interface RadioGroupController extends Entity {
  readonly [RadioGroupControllerTypeKey]?: void;
}

export interface RadioGroupControllerOptions {
  selectedIndex?: number;
  toggles: readonly ToggleController[];
}

export interface RadioGroupControllerSignals {
  onChange: Signal<(index: number) => void>;
}
