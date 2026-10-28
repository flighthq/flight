import { createMatrix4, createMatrix4FromValues, createRectangle } from '@flighthq/geometry/contract';
import type { LogState } from '@flighthq/log/contract';
import { clearLogOnceKeys, createLogState, getMemoryLogSinkEntries, setLogSink } from '@flighthq/log/contract';
import type { Camera2D, LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createCamera3D, setCamera3DViewMatrix4FromMatrix4 } from './camera.ts';
import { createCamera2D } from './camera2d.ts';
import { areCameraGuardsEnabled, disableCameraGuards, enableCameraGuards } from './enableCameraGuards.ts';
import { createPerspectiveProjection } from './projection.ts';
import { getCamera2DVisibleBounds } from './visibleBounds.ts';

function clock(): number {
  return 0;
}

function readLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

beforeEach(() => {
  logState = createLogState();
});

beforeEach(() => clearLogOnceKeys(logState));

describe('areCameraGuardsEnabled', () => {
  test('reports whether the guards are installed', () => {
    expect(areCameraGuardsEnabled()).toBe(false);
    enableCameraGuards(logState, clock);
    expect(areCameraGuardsEnabled()).toBe(true);
    disableCameraGuards();
    expect(areCameraGuardsEnabled()).toBe(false);
  });
});

describe('disableCameraGuards', () => {
  test('leaves the core silent again once removed', () => {
    enableCameraGuards(logState, clock);
    disableCameraGuards();
    expect(captureLog(() => getCamera2DVisibleBounds(degenerateCamera(), 64, 64, createRectangle()))).toHaveLength(0);
  });
});

describe('enableCameraGuards', () => {
  // `logOnce` keys on the zoom and has no reset, so this is the ONE test allowed to trigger the
  // degenerate key — a second would be deduplicated away and assert nothing. The seam itself is tested
  // directly, and deterministically, in visibleBounds.test.ts.
  test('warns, naming the zoom and the consequence, when the visible bounds cannot be computed', () => {
    enableCameraGuards(logState, clock);
    const entries = captureLog(() => getCamera2DVisibleBounds(degenerateCamera(), 64, 64, createRectangle()));
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ zoom: 0 });
    expect(String((entries[0].data as { message: string }).message)).toContain('nothing is culled');
  });

  test('warns on a non-orthonormal 3D view, naming the cause rather than a consumer', () => {
    enableCameraGuards(logState, clock);
    const entries = captureLog(() => {
      const camera = createCamera3D({
        far: 100,
        near: 0.1,
        projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
      });
      setCamera3DViewMatrix4FromMatrix4(
        camera,
        createMatrix4FromValues(3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1),
      );
    });
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as { message: string }).message)).toContain('not orthonormal');
  });

  // Reflections satisfy the precondition, so warning on them would be a false positive on a legitimate
  // water/mirror camera.
  test('stays silent for a reflection view', () => {
    enableCameraGuards(logState, clock);
    const entries = captureLog(() => {
      const camera = createCamera3D({
        far: 100,
        near: 0.1,
        projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
      });
      setCamera3DViewMatrix4FromMatrix4(
        camera,
        createMatrix4FromValues(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1),
      );
    });
    expect(entries).toHaveLength(0);
  });

  test('stays silent for a camera whose view matrix inverts', () => {
    enableCameraGuards(logState, clock);
    expect(captureLog(() => getCamera2DVisibleBounds(createCamera2D(), 64, 64, createRectangle()))).toHaveLength(0);
  });
});

afterEach(() => {
  disableCameraGuards();
});

function captureLog(run: () => void): LogEntry[] {
  const entries: LogEntry[] = [];
  setLogSink(logState, (entry) => entries.push(entry));
  try {
    run();
  } finally {
    setLogSink(logState, null);
  }
  return entries;
}

function degenerateCamera(): Camera2D {
  return createCamera2D({ zoom: 0 });
}

let logState: LogState = createLogState();
