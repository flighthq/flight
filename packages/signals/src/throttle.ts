import type { Signal } from '@flighthq/types';

import { connectSignal, disconnectSignal } from './slot';

export function connectSignalAtRate(
  source: Signal<(deltaTime: number) => void>,
  fps: number,
  slot: (deltaTime: number) => void,
): () => void {
  const period = 1000 / fps;
  let elapsed = 0;
  const handler = (delta: number) => {
    elapsed += delta;
    if (elapsed >= period) {
      slot(elapsed);
      elapsed %= period;
    }
  };
  connectSignal(source, handler);
  return () => disconnectSignal(source, handler);
}
