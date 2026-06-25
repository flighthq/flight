import type { Signal } from './Signal';

export interface ResourceLoaderItemSignals {
  onItemComplete: Signal<(key: string, value: unknown) => void>;
  onItemError: Signal<(key: string, error: unknown, attempt: number) => void>;
  onItemRetry: Signal<(key: string, attempt: number, delayMs: number) => void>;
  onItemStart: Signal<(key: string) => void>;
}
