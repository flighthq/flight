import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import * as screenContract from './screen';
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

describe('attachScreenPermissionChange', () => {
  it('is exported', () => expect(screenContract.attachScreenPermissionChange).toBeTypeOf('function'));
});
describe('attachScreenSignals', () => {
  it('is exported', () => expect(screenContract.attachScreenSignals).toBeTypeOf('function'));
});
describe('createScreenInfo', () => {
  it('is exported', () => expect(screenContract.createScreenInfo).toBeTypeOf('function'));
});
describe('createScreenMode', () => {
  it('is exported', () => expect(screenContract.createScreenMode).toBeTypeOf('function'));
});
describe('createScreenPermissionChange', () => {
  it('is exported', () => expect(screenContract.createScreenPermissionChange).toBeTypeOf('function'));
});
describe('createScreenSignals', () => {
  it('is exported', () => expect(screenContract.createScreenSignals).toBeTypeOf('function'));
});
describe('detachScreenPermissionChange', () => {
  it('is exported', () => expect(screenContract.detachScreenPermissionChange).toBeTypeOf('function'));
});
describe('detachScreenSignals', () => {
  it('is exported', () => expect(screenContract.detachScreenSignals).toBeTypeOf('function'));
});
describe('dipToScreenPoint', () => {
  it('is exported', () => expect(screenContract.dipToScreenPoint).toBeTypeOf('function'));
});
describe('dipToScreenRect', () => {
  it('is exported', () => expect(screenContract.dipToScreenRect).toBeTypeOf('function'));
});
describe('disposeScreenPermissionChange', () => {
  it('is exported', () => expect(screenContract.disposeScreenPermissionChange).toBeTypeOf('function'));
});
describe('disposeScreenSignals', () => {
  it('is exported', () => expect(screenContract.disposeScreenSignals).toBeTypeOf('function'));
});
describe('getPrimaryScreen', () => {
  it('is exported', () => expect(screenContract.getPrimaryScreen).toBeTypeOf('function'));
});
describe('getScreenBounds', () => {
  it('is exported', () => expect(screenContract.getScreenBounds).toBeTypeOf('function'));
});
describe('getScreenById', () => {
  it('is exported', () => expect(screenContract.getScreenById).toBeTypeOf('function'));
});
describe('getScreenContainingRect', () => {
  it('is exported', () => expect(screenContract.getScreenContainingRect).toBeTypeOf('function'));
});
describe('getScreenCurrentMode', () => {
  it('is exported', () => expect(screenContract.getScreenCurrentMode).toBeTypeOf('function'));
});
describe('getScreenCursorPosition', () => {
  it('is exported', () => expect(screenContract.getScreenCursorPosition).toBeTypeOf('function'));
});
describe('getScreenCursorScreen', () => {
  it('is exported', () => expect(screenContract.getScreenCursorScreen).toBeTypeOf('function'));
});
describe('getScreenDetailPermission', () => {
  it('is exported', () => expect(screenContract.getScreenDetailPermission).toBeTypeOf('function'));
});
describe('getScreenNearestPoint', () => {
  it('is exported', () => expect(screenContract.getScreenNearestPoint).toBeTypeOf('function'));
});
describe('getScreenNearestRect', () => {
  it('is exported', () => expect(screenContract.getScreenNearestRect).toBeTypeOf('function'));
});
describe('getScreens', () => {
  it('is exported', () => expect(screenContract.getScreens).toBeTypeOf('function'));
});
describe('getScreenWorkArea', () => {
  it('is exported', () => expect(screenContract.getScreenWorkArea).toBeTypeOf('function'));
});
describe('requestScreenDetails', () => {
  it('is exported', () => expect(screenContract.requestScreenDetails).toBeTypeOf('function'));
});
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

describe('screenToDipPoint', () => {
  it('is exported', () => expect(screenContract.screenToDipPoint).toBeTypeOf('function'));
});

describe('screenToDipRect', () => {
  it('is exported', () => expect(screenContract.screenToDipRect).toBeTypeOf('function'));
});
