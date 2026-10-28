import type { LogState } from '@flighthq/log/contract';
import { createLogState, setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { captureSnapshot } from './captureSnapshot.ts';
import { disableSnapshotGuards, enableSnapshotGuards } from './enableSnapshotGuards.ts';

let entries: LogEntry[];
let logState: LogState;

beforeEach(() => {
  entries = [];
  logState = createLogState();
  setLogSink(logState, (entry) => entries.push(entry));
});

afterEach(() => {
  disableSnapshotGuards();
});

function messages(): string[] {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? ''));
}

describe('disableSnapshotGuards', () => {
  it('stops the guard from inspecting later captures', () => {
    enableSnapshotGuards(logState, () => 0);
    disableSnapshotGuards();
    captureSnapshot({ when: new Date(0) });
    expect(messages()).toEqual([]);
  });
});

describe('enableSnapshotGuards', () => {
  it('says nothing for a plain acyclic source', () => {
    enableSnapshotGuards(logState, () => 0);
    captureSnapshot({ hp: 1, items: [{ id: 'a' }], nested: { deep: { ok: true } } });
    expect(messages()).toEqual([]);
  });

  it('warns about a Map, which clones but is neither frozen nor comparable', () => {
    enableSnapshotGuards(logState, () => 0);
    captureSnapshot({ byId: new Map([['a', 1]]) });
    expect(messages().join('\n')).toContain('Map');
  });

  it('warns about a cycle, naming the operations that cannot walk it', () => {
    enableSnapshotGuards(logState, () => 0);
    const node: Record<string, unknown> = { name: 'root' };
    node['self'] = node;
    captureSnapshot(node);
    expect(messages().join('\n')).toContain('cycle');
  });

  // The guard walks the same shape it is warning about, so it has to survive it — a cycle guard that
  // overflows the stack before it can report the cycle would be worse than no guard.
  it('terminates on the cyclic source it is reporting', () => {
    enableSnapshotGuards(logState, () => 0);
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { a };
    a['b'] = b;
    expect(() => captureSnapshot(a)).not.toThrow();
  });
});
