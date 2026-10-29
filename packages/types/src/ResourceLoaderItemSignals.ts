import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';

export interface ResourceLoaderItemSignals extends Entity {
  onItemComplete: Signal<readonly [string, unknown]>;
  onItemError: Signal<readonly [string, unknown, number]>;
  onItemRetry: Signal<readonly [string, number, number]>;
  onItemStart: Signal<string>;
}
