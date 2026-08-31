import { setVector3 } from '@flighthq/geometry/contract';
import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import { invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { createNode3D } from '@flighthq/scene3d/contract';
import type { LogEntry } from '@flighthq/types/contract';
import { afterEach, describe, expect, test } from 'vitest';

import { areSkeleton3DGuardsEnabled, disableSkeleton3DGuards, enableSkeleton3DGuards } from './enableSkeleton3DGuards';
import { createSkeleton3D, setSkeleton3DBindPose } from './skeleton3d';

beforeEach(() => clearLogOnceKeys());

describe('areSkeleton3DGuardsEnabled', () => {
  test('reports whether the guards are installed', () => {
    expect(areSkeleton3DGuardsEnabled()).toBe(false);
    enableSkeleton3DGuards();
    expect(areSkeleton3DGuardsEnabled()).toBe(true);
    disableSkeleton3DGuards();
    expect(areSkeleton3DGuardsEnabled()).toBe(false);
  });
});

describe('disableSkeleton3DGuards', () => {
  test('leaves the core silent again once removed', () => {
    enableSkeleton3DGuards();
    disableSkeleton3DGuards();
    expect(captureLog(() => setSkeleton3DBindPose(collapsedSkeleton()))).toHaveLength(0);
  });
});

describe('enableSkeleton3DGuards', () => {
  // `logOnce` keys on the joint index and has no reset, so only ONE test may trigger a given index — a
  // repeat would be deduplicated away and assert nothing while still looking green.
  test('warns, naming the joint, when a bind pose cannot be captured', () => {
    enableSkeleton3DGuards();
    const entries = captureLog(() => setSkeleton3DBindPose(collapsedSkeleton()));
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toMatchObject({ jointIndex: 0 });
    expect(String((entries[0].data as { message: string }).message)).toContain('will not deform');
  });

  test('stays silent for a rig whose joints all invert', () => {
    enableSkeleton3DGuards();
    expect(captureLog(() => setSkeleton3DBindPose(createSkeleton3D([createNode3D()])))).toHaveLength(0);
  });
});

afterEach(() => {
  disableSkeleton3DGuards();
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

function collapsedSkeleton(): ReturnType<typeof createSkeleton3D> {
  const collapsed = createNode3D();
  setVector3(collapsed.scale, 0, 0, 0);
  invalidateNodeLocalTransform(collapsed);
  return createSkeleton3D([collapsed]);
}
