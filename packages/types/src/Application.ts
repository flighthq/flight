import type { ApplicationWindow } from './ApplicationWindow';
import type { Signal } from './Signal';

export interface Application {
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
  // Opt-in lifecycle signals, allocated by enableApplicationLifecycleSignals; null until enabled.
  onActivate: Signal<() => void> | null;
  onDeactivate: Signal<() => void> | null;
  onError: Signal<(error: unknown) => void> | null;
  onExit: Signal<() => void>;
  onFixedUpdate: Signal<(fixedDeltaTime: number) => void> | null;
  onRender: Signal<() => void>;
  onUpdate: Signal<(deltaTime: number) => void>;
  // Managed windows registered with registerApplicationWindow.
  windows: ApplicationWindow[];
}
