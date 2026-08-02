// Splits the per-package test lane across N CI runners. Each runner computes the WHOLE partition and
// then keeps its own slice, so the shards never negotiate — the split is a pure function of the
// package list, and any two shards computing it agree by construction. That is why this is a module
// with tests rather than a few lines inside the runner: a partition that silently disagreed between
// runners would drop packages from the lane with every shard still reporting green.
//
// Split by PACKAGE, not by test file, because a package is the unit that owns a vitest config and
// therefore the unit a Vitest run can be given — its startup is paid once however its files are
// distributed, so moving files between runners would multiply that cost rather than divide it.
//
// Balance is worth the effort here because the shards do not divide cleanly on their own: each runner
// re-pays a cold module/page cache that a single serial run pays once, so a quarter of the lane costs
// ~40% of its serial time rather than 25%. That overhead is fixed per shard, which makes the variable
// part — how evenly the packages land — the only thing this module can still control.

export interface TestShardSpec {
  index: number;
  total: number;
}

export interface TestShardTarget {
  name: string;
  testFileCount: number;
  // The package's declared vitest environment. Only 'node' is cheap; every other value is treated as
  // a DOM environment, so an environment nobody has adopted yet is over-weighted rather than
  // under-weighted — the direction that costs balance instead of stranding a runner.
  environment: string;
}

// `--shard=2/4`. Returns null for anything malformed, so the caller can fail loudly with the value it
// was given rather than silently running shard 1 or the whole lane.
export function parseTestShard(value: string): TestShardSpec | null {
  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (match === null) return null;
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (total < 1 || index < 1 || index > total) return null;
  return { index, total };
}

// Longest-processing-time-first: order by descending weight, then give each package to whichever
// shard is currently lightest. Plain round-robin over an alphabetical list balances badly here
// because cost is clustered by name — the `host-*`, `scene2d-*`, and `scene3d-*` families are
// neighbours alphabetically and heavy together, so a contiguous or modulo split lands them on the
// same runner. LPT is the standard greedy for this and needs no tuning as packages are added.
export function selectTestShardTargets(
  targets: readonly Readonly<TestShardTarget>[],
  shard: Readonly<TestShardSpec>,
): string[] {
  const loads = new Array<number>(shard.total).fill(0);
  const members = new Array<string[]>(shard.total);
  for (let index = 0; index < shard.total; index++) members[index] = [];

  // Name is the tie-break so equal-weight packages land deterministically; two runners sorting the
  // same list must produce the same partition.
  const ordered = [...targets].sort(
    (a, b) => getTestShardWeight(b) - getTestShardWeight(a) || a.name.localeCompare(b.name),
  );

  for (const target of ordered) {
    let lightest = 0;
    for (let index = 1; index < loads.length; index++) {
      if (loads[index] < loads[lightest]) lightest = index;
    }
    members[lightest].push(target.name);
    loads[lightest] += getTestShardWeight(target);
  }

  return members[shard.index - 1].sort();
}

// A package costs a fixed Vitest startup plus its files, and a file's cost depends on the environment
// it runs in — under `isolate: true` every file builds a fresh one, and building a jsdom is far more
// expensive than a node context. Fitting duration against file count over 75 packages of a full lane
// run gave `node ≈ 4.9s + 0.22s/file` and `jsdom ≈ 2.1s + 0.90s/file`: a jsdom file costs roughly four
// node files, which a count-only weight cannot see at all. The constants below are those figures in
// quarter-second units, rounded — they exist to RANK packages against each other, not to predict a
// runtime, so precision past the 4× ratio and the startup floor buys nothing.
//
// The floor matters independently: without it the split treats a 1-file package as free and stacks
// dozens of them, and their startups, onto one runner.
function getTestShardWeight(target: Readonly<TestShardTarget>): number {
  const fileWeight = target.environment === 'node' ? NODE_FILE_WEIGHT : DOM_FILE_WEIGHT;
  return STARTUP_WEIGHT + target.testFileCount * fileWeight;
}

const STARTUP_WEIGHT = 8;
const NODE_FILE_WEIGHT = 1;
const DOM_FILE_WEIGHT = 4;
