import { allocateEntity, attachEntityBinding, finishEntity, getEntityBinding } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { HasScreenQuery, ScreenChangeEvent, ScreenInfo, ScreenPermissionState } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  attachScreenPermissionChange,
  attachScreenSignals,
  createScreenInfo,
  createScreenMode,
  createScreenPermissionChange,
  createScreenSignals,
  detachScreenPermissionChange,
  detachScreenSignals,
  dipToScreenPoint,
  dipToScreenRect,
  disposeScreenPermissionChange,
  disposeScreenSignals,
  getPrimaryScreen,
  getScreenBounds,
  getScreenById,
  getScreenContainingRect,
  getScreenCurrentMode,
  getScreenCursorPosition,
  getScreenCursorScreen,
  getScreenDetailPermission,
  getScreenNearestPoint,
  getScreenNearestRect,
  getScreenWorkArea,
  getScreens,
  initializeScreenInfo,
  initializeScreenMode,
  initializeScreenPermissionChange,
  initializeScreenSignals,
  requestScreenDetails,
  screenToDipPoint,
  screenToDipRect,
} from './screen';

describe('attachScreenPermissionChange', () => {
  it('forwards permission states from the supplied host', () => {
    const harness = createPermissionChangeHarness();
    const permissionChange = createScreenPermissionChange();
    const listener = vi.fn();
    connectSignal(permissionChange.onChange, listener);

    attachScreenPermissionChange(harness.host, permissionChange);
    harness.emit('granted');

    expect(listener).toHaveBeenCalledWith('granted');
  });
});

describe('attachScreenSignals', () => {
  it('routes added, removed, and metrics events to their matching signals', () => {
    const harness = createScreenChangeHarness();
    const signals = createScreenSignals();
    const added = vi.fn();
    const metricsChanged = vi.fn();
    const removed = vi.fn();
    connectSignal(signals.onScreenAdded, added);
    connectSignal(signals.onScreenMetricsChanged, metricsChanged);
    connectSignal(signals.onScreenRemoved, removed);
    const screen = createTestScreen(7, 100, 200, 800, 600);
    const metricsEvent: ScreenChangeEvent = {
      kind: 'ScreenMetricsChanged',
      screen,
      changedMetrics: { bounds: true, orientation: false, scaleFactor: true, workArea: false },
    };

    attachScreenSignals(harness.host, signals);
    harness.emit({ kind: 'ScreenAdded', screen, changedMetrics: null });
    harness.emit({ kind: 'ScreenRemoved', screen, changedMetrics: null });
    harness.emit(metricsEvent);

    expect(added).toHaveBeenCalledWith(screen);
    expect(removed).toHaveBeenCalledWith(screen);
    expect(metricsChanged).toHaveBeenCalledWith(metricsEvent);
  });
});

describe('createScreenInfo', () => {
  it('creates an entity with documented defaults and sentinels', () => {
    const screen = createScreenInfo();

    expect(EntityRuntimeKey in screen).toBe(true);
    expect(Object.keys(screen)).toHaveLength(25);
    expect(screen).toMatchObject({
      id: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      workWidth: 0,
      workHeight: 0,
      scaleFactor: 1,
      isPrimary: false,
      rotation: -1,
      orientation: 'Landscape',
      refreshRate: -1,
      colorDepth: -1,
      pixelDepth: -1,
      physicalWidth: -1,
      physicalHeight: -1,
      isHdr: false,
      colorSpace: 'srgb',
      maxLuminance: -1,
      depthPerComponent: -1,
      dpi: -1,
      label: '',
      internal: false,
      touchSupport: 'unknown',
      monochrome: false,
    });
  });
});

describe('createScreenMode', () => {
  it('creates an entity with unknown mode sentinels', () => {
    const mode = createScreenMode();

    expect(EntityRuntimeKey in mode).toBe(true);
    expect(mode).toMatchObject({ width: 0, height: 0, refreshRate: -1, colorDepth: -1, pixelFormat: '' });
  });
});

describe('createScreenPermissionChange', () => {
  it('creates an entity with an empty permission signal', () => {
    const permissionChange = createScreenPermissionChange();

    expect(EntityRuntimeKey in permissionChange).toBe(true);
    expect(permissionChange.onChange.data).toBeNull();
  });
});

describe('createScreenSignals', () => {
  it('creates an entity with three independent empty signals', () => {
    const signals = createScreenSignals();

    expect(EntityRuntimeKey in signals).toBe(true);
    expect(signals.onScreenAdded).not.toBe(signals.onScreenRemoved);
    expect(signals.onScreenAdded.data).toBeNull();
    expect(signals.onScreenMetricsChanged.data).toBeNull();
    expect(signals.onScreenRemoved.data).toBeNull();
  });
});

describe('detachScreenPermissionChange', () => {
  it('unsubscribes an attachment once and remains repeatable', () => {
    const harness = createPermissionChangeHarness();
    const permissionChange = createScreenPermissionChange();
    attachScreenPermissionChange(harness.host, permissionChange);

    detachScreenPermissionChange(permissionChange);
    detachScreenPermissionChange(permissionChange);

    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('detachScreenSignals', () => {
  it('unsubscribes an attachment once and remains repeatable', () => {
    const harness = createScreenChangeHarness();
    const signals = createScreenSignals();
    attachScreenSignals(harness.host, signals);

    detachScreenSignals(signals);
    detachScreenSignals(signals);

    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('dipToScreenPoint', () => {
  it('converts from desktop DIPs to screen-local pixels and returns out', () => {
    const screen = createTestScreen(1, 100, 50, 800, 600, { scaleFactor: 2 });
    const out = { x: -1, y: -1 };

    expect(dipToScreenPoint(screen, { x: 112, y: 73 }, out)).toBe(out);
    expect(out).toEqual({ x: 24, y: 46 });
  });

  it('is safe when out aliases the input point', () => {
    const screen = createTestScreen(1, 100, 50, 800, 600, { scaleFactor: 2 });
    const point = { x: 112, y: 73 };

    dipToScreenPoint(screen, point, point);

    expect(point).toEqual({ x: 24, y: 46 });
  });
});

describe('dipToScreenRect', () => {
  it('converts position and extent to screen-local pixels and returns out', () => {
    const screen = createTestScreen(1, 100, 50, 800, 600, { scaleFactor: 2 });
    const out = { x: -1, y: -1, width: -1, height: -1 };

    expect(dipToScreenRect(screen, { x: 112, y: 73, width: 30, height: 40 }, out)).toBe(out);
    expect(out).toEqual({ x: 24, y: 46, width: 60, height: 80 });
  });

  it('is safe when out aliases the input rectangle', () => {
    const screen = createTestScreen(1, 100, 50, 800, 600, { scaleFactor: 2 });
    const rect = { x: 112, y: 73, width: 30, height: 40 };

    dipToScreenRect(screen, rect, rect);

    expect(rect).toEqual({ x: 24, y: 46, width: 60, height: 80 });
  });
});

describe('disposeScreenPermissionChange', () => {
  it('detaches the host and clears the signal', () => {
    const harness = createPermissionChangeHarness();
    const permissionChange = createScreenPermissionChange();
    connectSignal(permissionChange.onChange, vi.fn());
    attachScreenPermissionChange(harness.host, permissionChange);

    disposeScreenPermissionChange(permissionChange);

    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(permissionChange.onChange.data).toBeNull();
  });
});

describe('disposeScreenSignals', () => {
  it('detaches the host and clears every signal', () => {
    const harness = createScreenChangeHarness();
    const signals = createScreenSignals();
    connectSignal(signals.onScreenAdded, vi.fn());
    connectSignal(signals.onScreenMetricsChanged, vi.fn());
    connectSignal(signals.onScreenRemoved, vi.fn());
    attachScreenSignals(harness.host, signals);

    disposeScreenSignals(signals);

    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(signals.onScreenAdded.data).toBeNull();
    expect(signals.onScreenMetricsChanged.data).toBeNull();
    expect(signals.onScreenRemoved.data).toBeNull();
  });
});

describe('getPrimaryScreen', () => {
  it('delegates to the host with the caller-owned output', () => {
    const primary = createTestScreen(3, 10, 20, 1920, 1080, { isPrimary: true });
    const host = createScreenQueryHost([primary]);
    const out = createScreenInfo();

    expect(getPrimaryScreen(host, out)).toBe(out);
    expect(host.screen.query.getPrimaryScreen).toHaveBeenCalledWith(out);
    expect(out).toMatchObject({ id: 3, x: 10, y: 20, width: 1920, height: 1080, isPrimary: true });
  });
});

describe('getScreenBounds', () => {
  it('extracts desktop bounds into and returns the supplied output', () => {
    const screen = createTestScreen(1, -1280, 120, 1280, 720);
    const out = { x: 0, y: 0, width: 0, height: 0 };

    expect(getScreenBounds(screen, out)).toBe(out);
    expect(out).toEqual({ x: -1280, y: 120, width: 1280, height: 720 });
  });
});

describe('getScreenById', () => {
  it('copies a matching screen into out and returns null without a match', () => {
    const first = createTestScreen(10, 0, 0, 100, 100);
    const second = createTestScreen(20, 300, 0, 200, 150, { label: 'external', scaleFactor: 2 });
    const host = createScreenQueryHost([first, second]);
    const out = createScreenInfo();

    expect(getScreenById(host, 20, out)).toBe(out);
    expect(Object.entries(out)).toEqual(Object.entries(second));
    expect(getScreenById(host, 99, out)).toBeNull();
  });

  it('preserves the destination runtime while copying public screen data', () => {
    const source = createTestScreen(20, 300, 40, 200, 150, { label: 'source' });
    const out = createTestScreen(99, 0, 0, 1, 1, { label: 'out' });
    const sourceBinding = { owner: 'source' };
    const outBinding = { owner: 'out' };
    attachEntityBinding(source, sourceBinding);
    attachEntityBinding(out, outBinding);
    const sourceRuntime = source[EntityRuntimeKey];
    const outRuntime = out[EntityRuntimeKey];

    expect(getScreenById(createScreenQueryHost([source]), source.id, out)).toBe(out);

    expect(Object.entries(out)).toEqual(Object.entries(source));
    expect(out[EntityRuntimeKey]).toBe(outRuntime);
    expect(out[EntityRuntimeKey]).not.toBe(sourceRuntime);
    expect(getEntityBinding(out)).toBe(outBinding);
    expect(getEntityBinding(source)).toBe(sourceBinding);
  });
});

describe('getScreenContainingRect', () => {
  it('selects the screen with the largest overlap area', () => {
    const left = createTestScreen(1, 0, 0, 100, 100);
    const lowerRight = createTestScreen(2, 100, 80, 100, 100);
    const host = createScreenQueryHost([left, lowerRight]);

    const result = getScreenContainingRect(host, { x: 50, y: 50, width: 100, height: 60 }, createScreenInfo());

    expect(result.id).toBe(1);
  });

  it('falls back to the screen nearest the rectangle center when none overlap', () => {
    const host = createScreenQueryHost(createSeparatedScreens());

    const result = getScreenContainingRect(host, { x: 230, y: 20, width: 20, height: 20 }, createScreenInfo());

    expect(result.id).toBe(2);
  });

  it('fills the documented default when no screens exist', () => {
    const out = createTestScreen(99, 10, 20, 30, 40);

    expect(getScreenContainingRect(createScreenQueryHost([]), { x: 0, y: 0, width: 10, height: 10 }, out)).toBe(out);
    expect(Object.entries(out)).toEqual(Object.entries(createScreenInfo()));
  });
});

describe('getScreenCurrentMode', () => {
  it('derives current dimensions and display metrics while clearing unknown format', () => {
    const screen = createTestScreen(1, 0, 0, 1920, 1080, { refreshRate: 144, colorDepth: 30 });
    const out = createScreenMode();
    out.pixelFormat = 'stale';

    expect(getScreenCurrentMode(screen, out)).toBe(out);
    expect(out).toMatchObject({ width: 1920, height: 1080, refreshRate: 144, colorDepth: 30, pixelFormat: '' });
  });
});

describe('getScreenCursorPosition', () => {
  it('delegates to the host with the caller-owned output', () => {
    const host = createScreenQueryHost([], { x: -20, y: 45 });
    const out = { x: 0, y: 0 };

    expect(getScreenCursorPosition(host, out)).toBe(out);
    expect(out).toEqual({ x: -20, y: 45 });
    expect(host.screen.query.getCursorPosition).toHaveBeenCalledWith(out);
  });
});

describe('getScreenCursorScreen', () => {
  it('resolves the host cursor position to its nearest screen', () => {
    const host = createScreenQueryHost(createSeparatedScreens(), { x: 340, y: 25 });
    const out = createScreenInfo();

    expect(getScreenCursorScreen(host, out)).toBe(out);
    expect(out.id).toBe(2);
  });
});

describe('getScreenDetailPermission', () => {
  it('returns the permission state supplied by the host', async () => {
    const host = createScreenDetailsHost('granted', true);

    await expect(getScreenDetailPermission(host)).resolves.toBe('granted');
    expect(host.screen.details.queryPermission).toHaveBeenCalledOnce();
  });
});

describe('getScreenNearestPoint', () => {
  it('uses half-open containment before distance', () => {
    const horizontalHost = createScreenQueryHost([
      createTestScreen(1, 0, 0, 100, 100),
      createTestScreen(2, 100, 0, 200, 100),
    ]);
    const verticalHost = createScreenQueryHost([
      createTestScreen(1, 0, 0, 100, 100),
      createTestScreen(2, 0, 100, 100, 200),
    ]);

    expect(getScreenNearestPoint(horizontalHost, { x: 20, y: 30 }, createScreenInfo()).id).toBe(1);
    expect(getScreenNearestPoint(horizontalHost, { x: 100, y: 30 }, createScreenInfo()).id).toBe(2);
    expect(getScreenNearestPoint(verticalHost, { x: 30, y: 100 }, createScreenInfo()).id).toBe(2);
  });

  it('selects the nearest screen center when the point is outside every screen', () => {
    const host = createScreenQueryHost(createSeparatedScreens());
    const diagonalHost = createScreenQueryHost([
      createTestScreen(1, 0, 0, 100, 100),
      createTestScreen(2, 300, 200, 100, 100),
    ]);

    expect(getScreenNearestPoint(host, { x: 180, y: 50 }, createScreenInfo()).id).toBe(1);
    expect(getScreenNearestPoint(host, { x: 240, y: 50 }, createScreenInfo()).id).toBe(2);
    expect(getScreenNearestPoint(diagonalHost, { x: 200, y: 100 }, createScreenInfo()).id).toBe(1);
    expect(getScreenNearestPoint(diagonalHost, { x: 200, y: 180 }, createScreenInfo()).id).toBe(2);
  });

  it('keeps the first screen when center distances tie', () => {
    const host = createScreenQueryHost(createSeparatedScreens());

    expect(getScreenNearestPoint(host, { x: 200, y: 50 }, createScreenInfo()).id).toBe(1);
  });

  it('fills the documented default when no screens exist', () => {
    const out = createTestScreen(99, 10, 20, 30, 40);

    expect(getScreenNearestPoint(createScreenQueryHost([]), { x: 5, y: 5 }, out)).toBe(out);
    expect(Object.entries(out)).toEqual(Object.entries(createScreenInfo()));
  });
});

describe('getScreenNearestRect', () => {
  it('prefers a screen that fully contains the rectangle', () => {
    const host = createScreenQueryHost(createSeparatedScreens());

    const result = getScreenNearestRect(host, { x: 320, y: 20, width: 40, height: 50 }, createScreenInfo());

    expect(result.id).toBe(2);
  });

  it('falls back to the screen nearest the rectangle center', () => {
    const host = createScreenQueryHost(createSeparatedScreens());

    const result = getScreenNearestRect(host, { x: 170, y: 20, width: 20, height: 20 }, createScreenInfo());

    expect(result.id).toBe(1);
  });

  it('uses center selection rather than largest overlap when no screen fully contains the rectangle', () => {
    const left = createTestScreen(1, 0, 0, 100, 100);
    const right = createTestScreen(2, 100, 0, 200, 100);
    const host = createScreenQueryHost([left, right]);
    const rect = { x: 50, y: 10, width: 100, height: 50 };

    expect(getScreenContainingRect(host, rect, createScreenInfo()).id).toBe(1);
    expect(getScreenNearestRect(host, rect, createScreenInfo()).id).toBe(2);
  });

  it('honors inclusive rectangle boundaries and full extents when testing containment', () => {
    const boundsHost = createScreenQueryHost([
      createTestScreen(1, 0, 0, 100, 100),
      createTestScreen(2, -10, -10, 200, 200),
    ]);
    const horizontalExtentHost = createScreenQueryHost([
      createTestScreen(1, 0, 0, 80, 100),
      createTestScreen(2, 30, 0, 100, 100),
    ]);
    const verticalExtentHost = createScreenQueryHost([
      createTestScreen(1, 0, 0, 100, 80),
      createTestScreen(2, 0, 30, 100, 100),
    ]);

    expect(getScreenNearestRect(boundsHost, { x: 0, y: 0, width: 100, height: 100 }, createScreenInfo()).id).toBe(1);
    expect(
      getScreenNearestRect(horizontalExtentHost, { x: 40, y: 0, width: 60, height: 100 }, createScreenInfo()).id,
    ).toBe(2);
    expect(
      getScreenNearestRect(verticalExtentHost, { x: 0, y: 40, width: 100, height: 60 }, createScreenInfo()).id,
    ).toBe(2);
  });

  it('fills the documented default when no screens exist', () => {
    const out = createTestScreen(99, 10, 20, 30, 40);

    expect(getScreenNearestRect(createScreenQueryHost([]), { x: 0, y: 0, width: 10, height: 10 }, out)).toBe(out);
    expect(Object.entries(out)).toEqual(Object.entries(createScreenInfo()));
  });
});

describe('getScreens', () => {
  it('delegates enumeration into and returns the caller-owned array', () => {
    const screen = createTestScreen(5, 0, 0, 1920, 1080);
    const host = createScreenQueryHost([screen]);
    const out: ScreenInfo[] = [];

    expect(getScreens(host, out)).toBe(out);
    expect(out).toEqual([screen]);
    expect(host.screen.query.getScreens).toHaveBeenCalledWith(out);
  });
});

describe('getScreenWorkArea', () => {
  it('extracts work dimensions at the screen desktop origin', () => {
    const screen = createTestScreen(1, 100, -50, 1920, 1080, { workWidth: 1900, workHeight: 1040 });
    const out = { x: 0, y: 0, width: 0, height: 0 };

    expect(getScreenWorkArea(screen, out)).toBe(out);
    expect(out).toEqual({ x: 100, y: -50, width: 1900, height: 1040 });
  });
});

describe('initializeScreenInfo', () => {
  it('is the construction initializer of createScreenInfo', () => {
    expect(typeof initializeScreenInfo).toBe('function');
  });
});

describe('initializeScreenMode', () => {
  it('is the construction initializer of createScreenMode', () => {
    expect(typeof initializeScreenMode).toBe('function');
  });
});

describe('initializeScreenPermissionChange', () => {
  it('is the construction initializer of createScreenPermissionChange', () => {
    expect(typeof initializeScreenPermissionChange).toBe('function');
  });
});

function createPermissionChangeHarness() {
  let listener: ((state: ScreenPermissionState) => void) | undefined;
  const unsubscribe = vi.fn();
  const host = {
    screen: {
      permissionChange: (() => {
        const out = allocateEntity<any>();
        out.subscribe = (next: (state: ScreenPermissionState) => void): (() => void) => {
          listener = next;
          return unsubscribe;
        };
        return finishEntity(out);
      })(),
    },
  };
  return { host, emit: (state: ScreenPermissionState) => listener?.(state), unsubscribe };
}

function createScreenChangeHarness() {
  let listener: ((event: Readonly<ScreenChangeEvent>) => void) | undefined;
  const unsubscribe = vi.fn();
  const host = {
    screen: {
      change: (() => {
        const out = allocateEntity<any>();
        out.subscribe = (next: (event: Readonly<ScreenChangeEvent>) => void): (() => void) => {
          listener = next;
          return unsubscribe;
        };
        return finishEntity(out);
      })(),
    },
  };
  return { host, emit: (event: Readonly<ScreenChangeEvent>) => listener?.(event), unsubscribe };
}

function createScreenDetailsHost(permission: ScreenPermissionState, requestResult: boolean) {
  return {
    screen: {
      details: (() => {
        const out = allocateEntity<any>();
        out.queryPermission = vi.fn(async () => permission);
        out.request = vi.fn(async () => requestResult);
        return finishEntity(out);
      })(),
    },
  };
}

function createScreenQueryHost(
  screens: readonly ScreenInfo[],
  cursor: Readonly<{ x: number; y: number }> = { x: 0, y: 0 },
): HasScreenQuery {
  return {
    screen: {
      query: (() => {
        const out = allocateEntity<any>();
        out.getCursorPosition = vi.fn((out: { x: number; y: number }) => {
          out.x = cursor.x;
          out.y = cursor.y;
          return out;
        });
        out.getPrimaryScreen = vi.fn((out: ScreenInfo) => {
          const primary = screens.find((screen) => screen.isPrimary) ?? screens[0];
          if (primary !== undefined) Object.assign(out, primary);
          return out;
        });
        out.getScreens = vi.fn((out: ScreenInfo[]) => {
          out.length = 0;
          out.push(...screens);
          return out;
        });
        return finishEntity(out);
      })(),
    },
  };
}

function createSeparatedScreens(): ScreenInfo[] {
  return [createTestScreen(1, 0, 0, 100, 100), createTestScreen(2, 300, 0, 100, 100)];
}

function createTestScreen(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
  overrides: Partial<ScreenInfo> = {},
): ScreenInfo {
  return Object.assign(
    createScreenInfo(),
    { id, x, y, width, height, workWidth: width, workHeight: height },
    overrides,
  );
}
describe('initializeScreenSignals', () => {
  it('is the construction initializer of createScreenSignals', () => {
    expect(typeof initializeScreenSignals).toBe('function');
  });
});

describe('requestScreenDetails', () => {
  it('returns whether the host granted detailed screen access', async () => {
    const host = createScreenDetailsHost('prompt', true);

    await expect(requestScreenDetails(host)).resolves.toBe(true);
    expect(host.screen.details.request).toHaveBeenCalledOnce();
  });
});

describe('screenToDipPoint', () => {
  it('converts screen-local pixels to desktop DIPs and returns out', () => {
    const screen = createTestScreen(1, 100, 50, 800, 600, { scaleFactor: 2 });
    const out = { x: -1, y: -1 };

    expect(screenToDipPoint(screen, { x: 24, y: 46 }, out)).toBe(out);
    expect(out).toEqual({ x: 112, y: 73 });
  });

  it('is safe when out aliases the input point', () => {
    const screen = createTestScreen(1, 100, 50, 800, 600, { scaleFactor: 2 });
    const point = { x: 24, y: 46 };

    screenToDipPoint(screen, point, point);

    expect(point).toEqual({ x: 112, y: 73 });
  });
});

describe('screenToDipRect', () => {
  it('converts screen-local position and extent to desktop DIPs and returns out', () => {
    const screen = createTestScreen(1, 100, 50, 800, 600, { scaleFactor: 2 });
    const out = { x: -1, y: -1, width: -1, height: -1 };

    expect(screenToDipRect(screen, { x: 24, y: 46, width: 60, height: 80 }, out)).toBe(out);
    expect(out).toEqual({ x: 112, y: 73, width: 30, height: 40 });
  });

  it('is safe when out aliases the input rectangle', () => {
    const screen = createTestScreen(1, 100, 50, 800, 600, { scaleFactor: 2 });
    const rect = { x: 24, y: 46, width: 60, height: 80 };

    screenToDipRect(screen, rect, rect);

    expect(rect).toEqual({ x: 112, y: 73, width: 30, height: 40 });
  });
});
