import type { InputSignals } from './InputSignals';

export interface AttachInputOptions {
  preventDefault?: boolean;
}

export interface InputManager extends InputSignals {
  enabled: boolean;
}
