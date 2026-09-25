import type { Entity } from './Entity.ts';
import type { GuiControllerOptions } from './GuiController.ts';
import type { InputKeyboardData } from './InputKeyboardData.ts';
import type { Node2D } from './Node2D.ts';
import type { RichText } from './RichText.ts';
import type { Signal } from './Signal.ts';
import type { TextInputManager, TextInputSource } from './TextInputManager.ts';

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
