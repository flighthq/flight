import { createRectangle } from '@flighthq/geometry/contract';
import { setLogSink } from '@flighthq/log/contract';
import type { Camera2D, LogEntry } from '@flighthq/types/contract';
import { afterEach, describe, expect, test } from 'vitest';

import { createCamera2D } from './camera2d';
import { areCameraGuardsEnabled, disableCameraGuards, enableCameraGuards } from './enableCameraGuards';
import { getCamera2DVisibleBounds } from './visibleBounds';

describe('areCameraGuardsEnabled', () => {
  test('reports whether the guards are installed', () => {
    expect(areCameraGuardsEnabled()).toBe(false);
    enableCameraGuards();
    expect(areCameraGuardsEnabled()).toBe(true);
    disableCameraGuards();
    expect(areCameraGuardsEnabled()).toBe(false);
  });
});

describe('disableCameraGuards', () => {
  test('leaves the core silent again once removed', () => {
    enableCameraGuards();
    disableCameraGuards();
    expect(captureLog(() => getCamera2DVisibleBounds(degenerateCamera(), createRectangle()))).toHaveLength(0);
  });
});

describe('enableCameraGuards', () => {
  // `logOnce` keys on the zoom and has no reset, so this is the ONE test allowed to trigger the
  // degenerate key — a second would be deduplicated away and assert nothing. The seam itself is tested
  // directly, and deterministically, in visibleBounds.test.ts.
  test('warns, naming the zoom and the consequence, when the visible bounds cannot be computed', () => {
    enableCameraGuards();
    const entries = captureLog(() => getCamera2DVisibleBounds(degenerateCamera(), createRectangle()));
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ zoom: 0 });
    expect(String((entries[0].data as { message: string }).message)).toContain('nothing is culled');
  });

  test('stays silent for a camera whose view matrix inverts', () => {
    enableCameraGuards();
    expect(captureLog(() => getCamera2DVisibleBounds(createCamera2D(64, 64), createRectangle()))).toHaveLength(0);
  });
});

afterEach(() => {
  disableCameraGuards();
});

function captureLog(run: () => void): LogEntry[] {
  const entries: LogEntry[] = [];
  setLogSink((entry) => entries.push(entry));
  try {
    run();
  } finally {
    setLogSink(null);
  }
  return entries;
}

function degenerateCamera(): Camera2D {
  return createCamera2D(64, 64, { zoom: 0 });
}
