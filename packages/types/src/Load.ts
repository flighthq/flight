import type { Signal } from './Signal';
export interface LoadProgress {
  readonly url: string;
  readonly loaded: number;
  readonly total: number;
  readonly phase: 'download' | 'upload';
}
export interface LoadOptions {
  readonly signal?: AbortSignal;
  readonly progress?: Signal<(progress: Readonly<LoadProgress>) => void>;
}
