import type { Signal } from './Signal';

export interface Application {
  onExit: Signal<() => void>;
  onRender: Signal<() => void>;
  onUpdate: Signal<(deltaTime: number) => void>;
}
