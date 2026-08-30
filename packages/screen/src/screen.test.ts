import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  attachScreenSignals,
  createScreenInfo,
  createScreenMode,
  createScreenPermissionChange,
  createScreenSignals,
  detachScreenSignals,
  disposeScreenPermissionChange,
  disposeScreenSignals,
  getScreenCurrentMode,
  getScreens,
} from './screen';

describe('screen entities', () => {
  it('composes values and event groups as entities', () => {
    expect(EntityRuntimeKey in createScreenInfo()).toBe(true);
    expect(EntityRuntimeKey in createScreenMode()).toBe(true);
    expect(EntityRuntimeKey in createScreenPermissionChange()).toBe(true);
    expect(EntityRuntimeKey in createScreenSignals()).toBe(true);
  });

  it('attaches and detaches display events through the supplied host', () => {
    const unsubscribe = vi.fn();
    let listener: ((event: any) => void) | undefined;
    const host = {
      screen: {
        change: {
          [EntityRuntimeKey]: {},
          subscribe(next: typeof listener) {
            listener = next;
            return unsubscribe;
          },
        },
      },
    } as any;
    const signals = createScreenSignals();
    const added = vi.fn();
    connectSignal(signals.onScreenAdded, added);
    attachScreenSignals(host, signals);
    listener?.({ kind: 'ScreenAdded', screen: createScreenInfo(), changedMetrics: null });
    expect(added).toHaveBeenCalledOnce();
    detachScreenSignals(signals);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('clears every signal on dispose', () => {
    const signals = createScreenSignals();
    connectSignal(signals.onScreenAdded, vi.fn());
    connectSignal(signals.onScreenMetricsChanged, vi.fn());
    connectSignal(signals.onScreenRemoved, vi.fn());
    disposeScreenSignals(signals);
    expect(signals.onScreenAdded.data).toBeNull();
    expect(signals.onScreenMetricsChanged.data).toBeNull();
    expect(signals.onScreenRemoved.data).toBeNull();

    const permission = createScreenPermissionChange();
    connectSignal(permission.onChange, vi.fn());
    disposeScreenPermissionChange(permission);
    expect(permission.onChange.data).toBeNull();
  });
});

describe('screen queries', () => {
  it('takes the host explicitly', () => {
    const info = createScreenInfo();
    info.width = 1920;
    const host = {
      screen: { query: { [EntityRuntimeKey]: {}, getScreens: (out: any[]) => ((out[0] = info), out) } },
    } as any;
    expect(getScreens(host, [])[0]).toBe(info);
  });

  it('derives the current mode without a provider', () => {
    const info = createScreenInfo();
    Object.assign(info, { width: 1920, height: 1080, refreshRate: 60, colorDepth: 24 });
    const mode = getScreenCurrentMode(info, createScreenMode());
    expect(mode).toMatchObject({ width: 1920, height: 1080, refreshRate: 60, colorDepth: 24 });
  });
});
