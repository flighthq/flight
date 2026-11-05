import type { Signal } from '@flighthq/signals/contract';
export interface LoadProgress {
  readonly url: string;
  readonly loaded: number;
  readonly total: number;
  readonly phase: 'download' | 'upload';
}
export interface LoadOptions {
  readonly signal?: AbortSignal;
  readonly progress?: Signal<Readonly<LoadProgress>>;
}
