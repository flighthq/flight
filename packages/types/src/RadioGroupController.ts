import type { Signal } from '@flighthq/signals/contract';

import type { Entity } from './Entity.ts';
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
  onChange: Signal<number>;
}
