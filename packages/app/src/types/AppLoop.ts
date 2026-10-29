import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { AppWindow } from './AppWindow.ts';

export interface AppLoop extends EntityRaw {
  readonly [EntityRuntimeKey]: EntityRuntime | undefined;
  // Milliseconds elapsed since the previous frame, clamped to the loop's maxDeltaTime.
  deltaTime: number;
  // Total elapsed time in seconds since the loop started.
  elapsedTime: number;
  // Number of frames processed since the loop started.
  frameCount: number;
  // Position within the current fixed step at render time, in [0, 1]. 1 in pure variable mode.
  interpolationAlpha: number;
  // Whether the loop is currently running (not stopped or paused).
  isRunning: boolean;
  // Opt-in lifecycle signals, allocated by enableAppLoopLifecycleSignals; null until enabled.
  onActivate: Signal<void> | null;
  onDeactivate: Signal<void> | null;
  onError: Signal<unknown> | null;
  onExit: Signal<void>;
  onFixedUpdate: Signal<number> | null;
  onRender: Signal<void>;
  onUpdate: Signal<number>;
  // Managed windows registered with registerAppLoopWindow.
  windows: AppWindow[];
}
