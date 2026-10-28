import { createRectangle } from '@flighthq/geometry/contract';
import type { LogState } from '@flighthq/log/contract';
import { addLogSink, createLogState, createMemoryLogSink, getMemoryLogSinkEntries } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import {
  areShapeBoundsGuardsEnabled,
  disableShapeBoundsGuards,
  enableShapeBoundsGuards,
} from './enableShapeBoundsGuards.ts';
import { createShape } from './shape.ts';
import { computeShapeBoundsRectangle } from './shapeBounds.ts';

let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

afterEach(() => {
  disableShapeBoundsGuards();
});

describe('areShapeBoundsGuardsEnabled', () => {
  it('reports whether the module guard is installed', () => {
    expect(areShapeBoundsGuardsEnabled()).toBe(false);
    enableShapeBoundsGuards(logState, 0);
    expect(areShapeBoundsGuardsEnabled()).toBe(true);
  });
});

describe('disableShapeBoundsGuards', () => {
  it('restores the silent production default', () => {
    enableShapeBoundsGuards(logState, 0);
    disableShapeBoundsGuards();

    expect(captureLog(() => computeMissingBounds())).toHaveLength(0);
  });
});

describe('enableShapeBoundsGuards', () => {
  it('names a missing key once and points to the plain explanation query', () => {
    enableShapeBoundsGuards(logState, 0);

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
  addLogSink(logState, sink.sink);
  run();
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}

function computeMissingBounds(): void {
  const shape = ((created) => {
    Object.assign(created.data, { commands: ['__test.guard-miss__', 0] });
    return created;
  })(createShape());
  computeShapeBoundsRectangle(createRectangle(), shape);
}
