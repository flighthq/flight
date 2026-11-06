import type { InputKeyboardData } from '@flighthq/input/contract';
import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';
import type { RichText } from '@flighthq/text/contract';
import type { TextInputManagerRaw, TextInputSource } from '@flighthq/textinput/contract';

import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';

declare const TextInputControllerTypeKey: unique symbol;

export interface TextInputController extends Entity {
  readonly [TextInputControllerTypeKey]?: void;
}

export interface TextInputControllerOptions extends GuiControllerOptions {
  background?: Node2D;
  caret?: Node2D;
  input?: TextInputSource;
  manager?: TextInputManagerRaw;
  textField: RichText;
}

export interface TextInputControllerSignals {
  onChange: Signal<string>;
  onSubmit: Signal<string>;
}

export type TextInputControllerKeyboardData = Readonly<InputKeyboardData>;
