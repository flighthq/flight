import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { ButtonController } from './ButtonController.ts';
import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';
import type { ListController } from './ListController.ts';

declare const ComboBoxControllerTypeKey: unique symbol;

export interface ComboBoxController extends Entity {
  readonly [ComboBoxControllerTypeKey]?: void;
}

export interface ComboBoxControllerOptions extends GuiControllerOptions {
  button: ButtonController;
  display?: Node2D;
  list: ListController;
  open?: boolean;
}

export interface ComboBoxControllerSignals {
  onChange: Signal<number>;
  onOpenChange: Signal<boolean>;
}
