import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Statechart step allocation shape', () => {
  it('keeps the no-change path allocation-free and records observed changes in one flat buffer', () => {
    const source = readFileSync('packages/statechart/src/statechart.ts', 'utf8');
    const start = source.indexOf('export function advanceStatechartInstance');
    const end = source.indexOf('export function createStatechartInstance', start);
    const advance = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(advance).toContain('let changed: number[] | null = null;');
    expect(advance).not.toMatch(/let changed[^;]*= \[\]/);
    expect(advance).toMatch(
      /if \(instance!\.signals !== null\) \{\s+if \(changed === null\) \{\s+changed = \[\] as never\[\];/,
    );
    expect(advance).toContain('activeChanged.push(regionIndex | 0);');
    expect(advance).toContain('activeChanged.push(previousStateIndex);');
    expect(advance).toContain('changedIndex += 2;');
    expect(advance).not.toContain('changed.push([');
  });
});
