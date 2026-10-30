// Generated from crates/flight-signals/src/throttle.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';

import { connectSignal, disconnectSignal } from './slot.ts';
import type {
  FrameTick,
  SignalRaw,
  SignalSlot,
  SignalThrottleOptions,
  SignalTimer,
  SignalTimerStateRaw,
  TimerId,
} from './types.ts';

interface PendingSignalArgs<T> {
  value: T;
}

/**
 * Advances explicit timer state to `nowMs`, running every due callback in fire-time order (D5:
 * the caller injects time; the contract never reads a clock). Callbacks run without the state
 * lock held, so they may schedule or clear timers re-entrantly.
 */
export function advanceSignalTimers(state: SignalTimerStateRaw, nowMs: number): void {
  for (;;) {
    const callback = takeDueSignalTimer(state, nowMs);
    {
      const matchValue = callback;
      if (matchValue !== undefined) {
        const callback = matchValue;
        callback();
      } else if (matchValue === undefined) {
        break;
      }
    }
  }
}

export function clearSignalTimeout(state: SignalTimerStateRaw, id: TimerId): void {
  let timerState = state!;
  const timers: SignalTimer[] = timerState.timers;
  (<T>(items: T[], keep: (item: T) => boolean): void => {
    let kept = 0;
    let index = 0;
    try {
      for (; index < items.length; index += 1) {
        const item = items[index];
        if (keep(item)) {
          items[kept] = item;
          kept += 1;
        }
      }
    } finally {
      const length = items.length;
      for (let rest = index; rest < length; rest += 1) {
        items[kept + rest - index] = items[rest];
      }
      items.length = kept + length - index;
    }
  })(timers, (timer) => timer.id.value !== id.value);
}

/**
 * Connects a frame-tick signal to a slot at a reduced frame rate (TS
 * `connectSignalAtFrameRate`). The slot receives the accumulated delta time since the last
 * fire, not the individual source deltas.
 */
export function connectSignalAtFrameRate(
  source: SignalRaw<FrameTick>,
  fps: number,
  slot: (arg0: number) => void,
): () => void {
  const period = 1000.0 / fps;
  const elapsed = { value: 0.0 };
  const handlerElapsed = elapsed;
  const handler: SignalSlot<FrameTick> = (tick: Readonly<FrameTick>) => {
    const fire = advanceFrameElapsed(handlerElapsed, tick.deltaTime, period);
    if (fire !== undefined) {
      const total = fire;
      slot(total);
    }
  };
  const slotId = connectSignal(source, handler, undefined);
  const cleanupSource = Object.defineProperties(
    { ...source },
    {
      data: {
        get: () => source.data,
        set: (value) => {
          source.data = value;
        },
        enumerable: true,
        configurable: true,
      },
    },
  );
  return () => disconnectSignal(cleanupSource, slotId);
}

function takeDueSignalTimer(state: SignalTimerStateRaw, nowMs: number): (() => void) | undefined {
  let timerState = state!;
  let earliest: number | undefined = undefined;
  for (let index = 0; index < timerState.timers.length; index += 1) {
    if (timerState.timers[index].fireAtMs <= nowMs) {
      {
        const matchValue = earliest;
        if (matchValue !== undefined) {
          const current = matchValue;
          const candidate = [timerState.timers[index].fireAtMs, timerState.timers[index].id.value] as const;
          const existing = [timerState.timers[current].fireAtMs, timerState.timers[current].id.value] as const;
          if (candidate[0] < existing[0] || (candidate[0] === existing[0] && candidate[1] < existing[1])) {
            earliest = index;
          }
        } else if (matchValue === undefined) {
          earliest = index;
        }
      }
    }
  }
  if (earliest !== undefined) {
    const index = earliest;
    timerState.nowMs = timerState.timers[index].fireAtMs;
    const timers: SignalTimer[] = timerState.timers;
    return (<T>(items: T[], index: number): T => {
      if (index >= items.length) {
        throw new RangeError('Vec removal index out of bounds');
      }
      return items.splice(index, 1)[0];
    })(timers, index).callback;
  }
  timerState.nowMs = nowMs;
  return undefined;
}

/**
 * Connects a slot with debounce semantics (TS `connectSignalDebounced`). Timer state and the
 * current time are explicit (D5); the caller advances both with `advanceSignalTimers`.
 */
export function connectSignalDebounced<T>(
  source: SignalRaw<T>,
  delayMs: number,
  slot: SignalSlot<T>,
  options: Readonly<SignalThrottleOptions> | undefined,
  state: SignalTimerStateRaw,
): () => void {
  const leading = options?.leading ?? false;
  const trailing = options?.trailing ?? true;
  const timerId: { value: TimerId | undefined } = { value: undefined };
  const lastArgs: { value: PendingSignalArgs<T> | undefined } = { value: undefined };
  const leadingFired = { value: false };
  const handlerSlot = slot;
  const handlerState = state;
  const handlerTimerId = timerId;
  const handlerLastArgs = lastArgs;
  const handlerLeadingFired = leadingFired;
  const handler: SignalSlot<T> = (args: T) => {
    handlerLastArgs.value = { value: args };
    if (leading && handlerTimerId.value === undefined && !handlerLeadingFired.value) {
      handlerLeadingFired.value = true;
      handlerSlot(args);
    }
    {
      const $pending = handlerTimerId.value;
      if ($pending !== undefined) {
        const pending = $pending;
        clearSignalTimeout(handlerState, pending);
      }
    }
    const timerSlot = handlerSlot;
    const timerLastArgs = handlerLastArgs;
    const timerLeadingFired = handlerLeadingFired;
    const timerTimerId = handlerTimerId;
    const id = setSignalTimeout(handlerState, delayMs, () => {
      timerTimerId.value = undefined;
      timerLeadingFired.value = false;
      if (trailing) {
        const args = takePendingSignalArgs(timerLastArgs);
        if (args !== undefined) {
          timerSlot(args.value);
        }
      }
    });
    handlerTimerId.value = id;
  };
  const slotId = connectSignal(source, handler, undefined);
  const cleanupSource = Object.defineProperties(
    { ...source },
    {
      data: {
        get: () => source.data,
        set: (value) => {
          source.data = value;
        },
        enumerable: true,
        configurable: true,
      },
    },
  );
  const cleanupState = state;
  const cleanupTimer = timerId;
  return () => {
    disconnectSignal(cleanupSource, slotId);
    const pending = cleanupTimer.value;
    if (pending !== undefined) {
      clearSignalTimeout(cleanupState, pending);
    }
  };
}

/**
 * Connects a slot with throttle semantics (TS `connectSignalThrottled`), preserving the original
 * payload for the trailing call. Timer state and the current time are explicit (D5).
 */
export function connectSignalThrottled<T>(
  source: SignalRaw<T>,
  intervalMs: number,
  slot: SignalSlot<T>,
  options: Readonly<SignalThrottleOptions> | undefined,
  state: SignalTimerStateRaw,
): () => void {
  const leading = options?.leading ?? true;
  const trailing = options?.trailing ?? true;
  const lastFiredAt: { value: number } = { value: Number.NEGATIVE_INFINITY };
  const trailingTimer: { value: TimerId | undefined } = { value: undefined };
  const lastArgs: { value: PendingSignalArgs<T> | undefined } = { value: undefined };
  const handlerSlot = slot;
  const handlerState = state;
  const handlerLastFiredAt = lastFiredAt;
  const handlerTrailingTimer = trailingTimer;
  const handlerLastArgs = lastArgs;
  const handler: SignalSlot<T> = (args: T) => {
    const now = handlerState!.nowMs;
    const remaining = intervalMs - (now - handlerLastFiredAt.value);
    if (remaining <= 0.0 || remaining > intervalMs) {
      {
        const $pending = handlerTrailingTimer.value;
        if ($pending !== undefined) {
          const pending = $pending;
          clearSignalTimeout(handlerState, pending);
          handlerTrailingTimer.value = undefined;
        }
      }
      handlerLastFiredAt.value = now;
      if (leading) {
        handlerSlot(args);
      } else {
        if (trailing) {
          handlerLastArgs.value = { value: args };
          const timerSlot = handlerSlot;
          const timerState = handlerState;
          const timerLastFiredAt = handlerLastFiredAt;
          const timerTrailingTimer = handlerTrailingTimer;
          const timerLastArgs = handlerLastArgs;
          const id = setSignalTimeout(handlerState, intervalMs, () => {
            timerLastFiredAt.value = timerState!.nowMs;
            timerTrailingTimer.value = undefined;
            const args = takePendingSignalArgs(timerLastArgs);
            if (args !== undefined) {
              timerSlot(args.value);
            }
          });
          handlerTrailingTimer.value = id;
        }
      }
    } else {
      if (trailing) {
        {
          const $pending = handlerTrailingTimer.value;
          if ($pending !== undefined) {
            const pending = $pending;
            clearSignalTimeout(handlerState, pending);
          }
        }
        handlerLastArgs.value = { value: args };
        const timerSlot = handlerSlot;
        const timerState = handlerState;
        const timerLastFiredAt = handlerLastFiredAt;
        const timerTrailingTimer = handlerTrailingTimer;
        const timerLastArgs = handlerLastArgs;
        const id = setSignalTimeout(handlerState, remaining, () => {
          timerLastFiredAt.value = timerState!.nowMs;
          timerTrailingTimer.value = undefined;
          const args = takePendingSignalArgs(timerLastArgs);
          if (args !== undefined) {
            timerSlot(args.value);
          }
        });
        handlerTrailingTimer.value = id;
      }
    }
  };
  const slotId = connectSignal(source, handler, undefined);
  const cleanupSource = Object.defineProperties(
    { ...source },
    {
      data: {
        get: () => source.data,
        set: (value) => {
          source.data = value;
        },
        enumerable: true,
        configurable: true,
      },
    },
  );
  const cleanupState = state;
  const cleanupTimer = trailingTimer;
  return () => {
    disconnectSignal(cleanupSource, slotId);
    const pending = cleanupTimer.value;
    if (pending !== undefined) {
      clearSignalTimeout(cleanupState, pending);
    }
  };
}

function advanceFrameElapsed(elapsed: { value: number }, deltaTime: number, period: number): number | undefined {
  let guard = elapsed;
  guard.value += deltaTime;
  if (guard.value >= period) {
    const total = guard.value;
    guard.value %= period;
    return total;
  }
  return undefined;
}

function takePendingSignalArgs<T>(pending: { value: T | undefined }): T | undefined {
  let guard = pending;
  const args = guard.value;
  guard.value = undefined;
  return args;
}

export function createSignalTimerState(): SignalTimerStateRaw {
  let out: SignalTimerStateRaw = Object.assign(allocateEntity<SignalTimerStateRaw>(), {
    nextId: 0,
    nowMs: 0,
    timers: [],
  });
  initializeSignalTimerState(out);
  return out;
}

export function initializeSignalTimerState(out: SignalTimerStateRaw): void {
  out.nowMs = 0.0;
  out.timers.length = 0;
  out.nextId = 1;
}

export function setSignalTimeout(state: SignalTimerStateRaw, delayMs: number, callback: () => void): TimerId {
  let timerState = state!;
  const id: TimerId = { value: timerState.nextId };
  timerState.nextId += 1;
  const fireAtMs = timerState.nowMs + delayMs;
  let index = 0;
  while (
    index < timerState.timers.length &&
    (timerState.timers[index].fireAtMs < fireAtMs ||
      (timerState.timers[index].fireAtMs === fireAtMs && timerState.timers[index].id.value <= id.value))
  ) {
    index += 1;
  }
  const timers: SignalTimer[] = timerState.timers;
  (<T>(items: T[], index: number, value: T): void => {
    if (index > items.length) {
      throw new RangeError('Vec insertion index out of bounds');
    }
    items.splice(index, 0, value);
  })(timers, index, { id: id, fireAtMs: fireAtMs, callback: callback });
  return id;
}
