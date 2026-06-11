import type { Signal } from './Signal';

export interface Application {
  observers: Map<symbol, () => void>;
  onExit: Signal<() => void>;
  onRender: Signal<() => void>;
  onUpdate: Signal<(deltaTime: number) => void>;
}
