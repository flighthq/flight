import type { InputSignals } from './InputSignals.ts';

export interface AttachInputOptions {
  preventDefault?: boolean;
}

export interface InputManager extends InputSignals {
  enabled: boolean;
}
