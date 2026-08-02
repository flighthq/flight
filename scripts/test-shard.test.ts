import { describe, expect, it } from 'vitest';

import { parseTestShard, selectTestShardTargets } from './test-shard.js';

// Defaults to the cheap environment so a case that is not about environment reads as pure weight.
function targets(...spec: readonly (readonly [string, number] | readonly [string, number, string])[]) {
  return spec.map(([name, testFileCount, environment]) => ({
    name,
    testFileCount,
    environment: environment ?? 'node',
  }));
}

describe('parseTestShard', () => {
  it('parses a well-formed shard', () => {
    expect(parseTestShard('2/4')).toEqual({ index: 2, total: 4 });
    expect(parseTestShard(' 1/1 ')).toEqual({ index: 1, total: 1 });
  });

  it('rejects an index outside the shard count', () => {
    // The off-by-one a hand-written matrix invites: `shard: [0, 1, 2, 3]` against `/4`.
    expect(parseTestShard('0/4')).toBeNull();
    expect(parseTestShard('5/4')).toBeNull();
  });

  it('rejects malformed values rather than guessing', () => {
    expect(parseTestShard('2')).toBeNull();
    expect(parseTestShard('2/')).toBeNull();
    expect(parseTestShard('a/b')).toBeNull();
    expect(parseTestShard('')).toBeNull();
    expect(parseTestShard('2/0')).toBeNull();
  });
});

describe('selectTestShardTargets', () => {
  it('returns every package when there is one shard', () => {
    const all = targets(['alpha', 3], ['beta', 1], ['gamma', 9]);
    expect(selectTestShardTargets(all, { index: 1, total: 1 })).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('partitions without dropping or duplicating a package', () => {
    // The property that matters most: every package runs exactly once across the shards. A split
    // that loses one leaves the lane green while a package goes untested.
    const all = targets(
      ...Array.from(
        { length: 141 },
        (_, index) => [`pkg-${index}`, index % 17, index % 2 === 0 ? 'node' : 'jsdom'] as const,
      ),
    );
    const seen = [1, 2, 3, 4].flatMap((index) => selectTestShardTargets(all, { index, total: 4 }));
    expect(seen.sort()).toEqual(all.map((target) => target.name).sort());
  });

  it('is deterministic, so two runners agree on the partition', () => {
    const all = targets(['alpha', 5], ['beta', 5], ['gamma', 5], ['delta', 5]);
    const shard = { index: 2, total: 2 };
    expect(selectTestShardTargets(all, shard)).toEqual(selectTestShardTargets([...all].reverse(), shard));
  });

  it('balances weight rather than package count', () => {
    // One heavy package against many light ones: a count-based split would put the heavy one with a
    // third of the rest. LPT gives it its own shard.
    const all = targets(['heavy', 200], ['a', 1], ['b', 1], ['c', 1]);
    expect(selectTestShardTargets(all, { index: 1, total: 2 })).toEqual(['heavy']);
    expect(selectTestShardTargets(all, { index: 2, total: 2 })).toEqual(['a', 'b', 'c']);
  });

  it('spreads equal-weight packages evenly instead of filling one shard', () => {
    // Guards the startup floor: with weight counted as files alone, four 0-file packages all weigh
    // nothing and the "lightest shard" is always the first one.
    const all = targets(['a', 0], ['b', 0], ['c', 0], ['d', 0]);
    expect(selectTestShardTargets(all, { index: 1, total: 2 })).toHaveLength(2);
    expect(selectTestShardTargets(all, { index: 2, total: 2 })).toHaveLength(2);
  });

  it('weights a DOM package above a node package with the same file count', () => {
    // The correction a count-only weight cannot express: measured over a full lane run, a jsdom file
    // costs ~4x a node file (fresh DOM per file under isolate:true). One jsdom package of 10 files
    // therefore roughly matches three node packages of the same size, and takes a shard to itself —
    // where a count-only weight would have paired it with two of them and left the shards lopsided.
    const all = targets(['dom', 10, 'jsdom'], ['a', 10], ['b', 10], ['c', 10]);
    expect(selectTestShardTargets(all, { index: 1, total: 2 })).toEqual(['dom']);
    expect(selectTestShardTargets(all, { index: 2, total: 2 })).toEqual(['a', 'b', 'c']);
  });

  it('treats an unrecognised environment as a DOM environment', () => {
    // Over-weighting an environment nobody has adopted costs balance; under-weighting it strands a
    // runner. The tie-break makes the direction observable: `happy-dom` outweighs the node package.
    const all = targets(['exotic', 20, 'happy-dom'], ['plain', 20]);
    expect(selectTestShardTargets(all, { index: 1, total: 2 })).toEqual(['exotic']);
  });

  it('returns an empty shard when there are more shards than packages', () => {
    // Not an error here — the runner owns the fail-loudly verdict, and it needs to see the emptiness
    // to report which shard was starved.
    expect(selectTestShardTargets(targets(['only', 1]), { index: 2, total: 2 })).toEqual([]);
  });
});
