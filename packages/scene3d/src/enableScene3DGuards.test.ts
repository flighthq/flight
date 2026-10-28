import {
  createCamera3D,
  createPerspectiveProjection,
  setCamera3DViewMatrix4FromMatrix4,
} from '@flighthq/camera/contract';
import { createMatrix4, createMatrix4FromValues } from '@flighthq/geometry/contract';
import type { LogState } from '@flighthq/log/contract';
import { createLogState, setLogSink } from '@flighthq/log/contract';
import { createPlaneMeshGeometry } from '@flighthq/meshgeometry/contract';
import type { Camera3D, LogEntry } from '@flighthq/types/contract';
import { afterEach, describe, expect, test } from 'vitest';

import { createBillboard } from './billboard.ts';
import { orientBillboardToCamera } from './billboardCamera.ts';
import { areScene3DGuardsEnabled, disableScene3DGuards, enableScene3DGuards } from './enableScene3DGuards.ts';

let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

describe('areScene3DGuardsEnabled', () => {
  test('reports whether the guards are installed', () => {
    expect(areScene3DGuardsEnabled()).toBe(false);
    enableScene3DGuards(logState, () => 0);
    expect(areScene3DGuardsEnabled()).toBe(true);
    disableScene3DGuards();
    expect(areScene3DGuardsEnabled()).toBe(false);
  });
});

describe('disableScene3DGuards', () => {
  test('leaves the core silent again once removed', () => {
    enableScene3DGuards(logState, () => 0);
    disableScene3DGuards();
    expect(captureLog(() => orientBillboardToCamera(billboard(), singularCamera()))).toHaveLength(0);
  });
});

describe('enableScene3DGuards', () => {
  // `logOnce` keys this condition once per LogState; beforeEach hands every test a fresh state, so the
  // warning is never deduplicated away by an earlier test.
  test('warns, naming the setter that can produce it, when the camera basis cannot be derived', () => {
    enableScene3DGuards(logState, () => 0);
    const entries = captureLog(() => orientBillboardToCamera(billboard(), singularCamera()));
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as { message: string }).message)).toContain('setCamera3DViewMatrix4FromMatrix4');
  });
});

afterEach(() => {
  disableScene3DGuards();
});

function billboard(): ReturnType<typeof createBillboard> {
  return ((created) => {
    created.mode = 'full';
    return created;
  })(createBillboard(createPlaneMeshGeometry(), [null]));
}

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

function singularCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: 1 }),
  });
  setCamera3DViewMatrix4FromMatrix4(camera, createMatrix4FromValues(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
  return camera;
}
