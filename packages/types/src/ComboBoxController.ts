import type { ButtonController } from './ButtonController.ts';
import type { Entity } from './Entity.ts';
import type { GuiControllerOptions } from './GuiController.ts';
import type { ListController } from './ListController.ts';
import type { Node2D } from './Node2D.ts';
import type { Signal } from './Signal.ts';

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
  onChange: Signal<(index: number) => void>;
  onOpenChange: Signal<(open: boolean) => void>;
}
