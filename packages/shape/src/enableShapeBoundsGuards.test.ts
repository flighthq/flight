import { createRectangle } from '@flighthq/geometry/contract';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import {
  areShapeBoundsGuardsEnabled,
  disableShapeBoundsGuards,
  enableShapeBoundsGuards,
} from './enableShapeBoundsGuards';
import { createShape } from './shape';
import { computeShapeBoundsRectangle } from './shapeBounds';

afterEach(() => {
  disableShapeBoundsGuards();
});

describe('areShapeBoundsGuardsEnabled', () => {
  it('reports whether the module guard is installed', () => {
    expect(areShapeBoundsGuardsEnabled()).toBe(false);
    enableShapeBoundsGuards();
    expect(areShapeBoundsGuardsEnabled()).toBe(true);
  });
});

describe('disableShapeBoundsGuards', () => {
  it('restores the silent production default', () => {
    enableShapeBoundsGuards();
    disableShapeBoundsGuards();

    expect(captureLog(() => computeMissingBounds())).toHaveLength(0);
  });
});

describe('enableShapeBoundsGuards', () => {
  it('names a missing key once and points to the plain explanation query', () => {
    enableShapeBoundsGuards();

    const entries = captureLog(() => {
      computeMissingBounds();
      computeMissingBounds();
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].channel).toBe('shape');
    expect(entries[0].data).toMatchObject({ missingCommandKey: '__test.guard-miss__', mode: 'ink' });
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('explainShapeBounds');
  });
});

function captureLog(run: () => void): readonly LogEntry[] {
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    run();
    return getMemoryLogSinkEntries(sink);
  } finally {
    removeLogSink(sink.sink);
  }
}

function computeMissingBounds(): void {
  const shape = createShape({ data: { commands: ['__test.guard-miss__', 0] } });
  computeShapeBoundsRectangle(createRectangle(), shape);
}
