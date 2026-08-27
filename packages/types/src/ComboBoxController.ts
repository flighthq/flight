import type { ButtonController } from './ButtonController';
import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { ListController } from './ListController';
import type { Node2D } from './Node2D';
import type { Signal } from './Signal';

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
