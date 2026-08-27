import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { InputKeyboardData } from './InputKeyboardData';
import type { Node2D } from './Node2D';
import type { RichText } from './RichText';
import type { Signal } from './Signal';
import type { TextInputManager, TextInputSource } from './TextInputManager';

declare const TextInputControllerTypeKey: unique symbol;

export interface TextInputController extends Entity {
  readonly [TextInputControllerTypeKey]?: void;
}

export interface TextInputControllerOptions extends GuiControllerOptions {
  background?: Node2D;
  caret?: Node2D;
  input?: TextInputSource;
  manager?: TextInputManager;
  textField: RichText;
}

export interface TextInputControllerSignals {
  onChange: Signal<(text: string) => void>;
  onSubmit: Signal<(text: string) => void>;
}

export type TextInputControllerKeyboardData = Readonly<InputKeyboardData>;
