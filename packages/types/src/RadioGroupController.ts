import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';
import type { ToggleController } from './ToggleController.ts';

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
