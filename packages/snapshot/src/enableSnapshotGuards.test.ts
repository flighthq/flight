import { setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { captureSnapshot } from './captureSnapshot';
import { disableSnapshotGuards, enableSnapshotGuards } from './enableSnapshotGuards';

let entries: LogEntry[];

beforeEach(() => {
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  disableSnapshotGuards();
  setLogSink(null);
});

function messages(): string[] {
  return entries.map((e) => String((e.data as { message?: unknown } | undefined)?.message ?? ''));
}

describe('disableSnapshotGuards', () => {
  it('stops the guard from inspecting later captures', () => {
    enableSnapshotGuards();
    disableSnapshotGuards();
    captureSnapshot({ when: new Date(0) });
    expect(messages()).toEqual([]);
  });
});

describe('enableSnapshotGuards', () => {
  it('says nothing for a plain acyclic source', () => {
    enableSnapshotGuards();
    captureSnapshot({ hp: 1, items: [{ id: 'a' }], nested: { deep: { ok: true } } });
    expect(messages()).toEqual([]);
  });

  it('warns about a Map, which clones but is neither frozen nor comparable', () => {
    enableSnapshotGuards();
    captureSnapshot({ byId: new Map([['a', 1]]) });
    expect(messages().join('\n')).toContain('Map');
  });

  it('warns about a cycle, naming the operations that cannot walk it', () => {
    enableSnapshotGuards();
    const node: Record<string, unknown> = { name: 'root' };
    node['self'] = node;
    captureSnapshot(node);
    expect(messages().join('\n')).toContain('cycle');
  });

  // The guard walks the same shape it is warning about, so it has to survive it — a cycle guard that
  // overflows the stack before it can report the cycle would be worse than no guard.
  it('terminates on the cyclic source it is reporting', () => {
    enableSnapshotGuards();
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { a };
    a['b'] = b;
    expect(() => captureSnapshot(a)).not.toThrow();
  });
});
