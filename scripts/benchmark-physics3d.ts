import { Session } from 'node:inspector/promises';
import { cpus, freemem, platform, release, totalmem } from 'node:os';

import {
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionPairTests3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import {
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
  addPhysics3DBody,
} from '@flighthq/physics3d/contract';
import { stepPhysics3D } from '@flighthq/physics3d/contract';
import { createBvhSpatialBackend3D, createUniformGridSpatialBackend3D } from '@flighthq/spatial/contract';
import type { Physics3DWorld } from '@flighthq/types/contract';

interface AllocationProfileNode {
  selfSize: number;
  children: AllocationProfileNode[];
  callFrame: {
    functionName: string;
    url: string;
    lineNumber: number;
  };
}

interface Physics3DBenchmarkBudget {
  p95CpuMilliseconds: number;
  sampledAllocationBytesPerStep: number;
  retainedBytesPerStep: number;
}

interface Physics3DBenchmarkMeasurement {
  backend: 'bvh' | 'uniform-grid';
  scenario: 'contact-stack' | 'sparse-moving';
  bodies: number;
  contacts: number;
  distribution: string;
  p50WallMilliseconds: number;
  p95WallMilliseconds: number;
  p50CpuMilliseconds: number;
  p95CpuMilliseconds: number;
  sampledAllocationBytesPerStep: number;
  retainedBytesPerStep: number;
  topAllocationSites: { site: string; bytesPerStep: number }[];
  budget: Physics3DBenchmarkBudget;
  passed: boolean;
}

async function main(): Promise<void> {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
  registerBuiltInCollisionPairTests3D();

  const measurements: Physics3DBenchmarkMeasurement[] = [];
  for (const backend of ['uniform-grid', 'bvh'] as const) {
    for (const scenario of ['contact-stack', 'sparse-moving'] as const) {
      measurements.push(await benchmarkPhysics3DScene(backend, scenario));
    }
  }

  const report = {
    kind: 'physics3d-performance-qualification',
    measuredAt: new Date().toISOString(),
    hardware: {
      cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpus: cpus().length,
      memoryBytes: totalmem(),
      freeMemoryBytesAtReport: freemem(),
      platform: platform(),
      release: release(),
      architecture: process.arch,
      node: process.version,
    },
    sampling: {
      timedSteps: TIMED_STEPS,
      allocationSteps: ALLOCATION_STEPS,
      inspectorSamplingIntervalBytes: ALLOCATION_SAMPLING_INTERVAL,
    },
    measurements,
    passed: measurements.every((measurement) => measurement.passed),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

async function benchmarkPhysics3DScene(
  backend: Physics3DBenchmarkMeasurement['backend'],
  scenario: Physics3DBenchmarkMeasurement['scenario'],
): Promise<Physics3DBenchmarkMeasurement> {
  const world = createPhysics3DBenchmarkWorld(backend, scenario);
  const settleSteps = scenario === 'contact-stack' ? STACK_SETTLE_STEPS : SPARSE_WARMUP_STEPS;
  for (let step = 0; step < settleSteps; step += 1) stepPhysics3D(world, TIMESTEP);
  for (let step = 0; step < TIMING_WARMUP_STEPS; step += 1) stepPhysics3D(world, TIMESTEP);

  const wallTimes = new Array<number>(TIMED_STEPS);
  const cpuTimes = new Array<number>(TIMED_STEPS);
  for (let step = 0; step < TIMED_STEPS; step += 1) {
    const cpuStartedAt = process.cpuUsage();
    const startedAt = performance.now();
    stepPhysics3D(world, TIMESTEP);
    wallTimes[step] = performance.now() - startedAt;
    const cpu = process.cpuUsage(cpuStartedAt);
    cpuTimes[step] = (cpu.user + cpu.system) / 1000;
  }
  wallTimes.sort((a, b) => a - b);
  cpuTimes.sort((a, b) => a - b);

  const allocations = await measurePhysics3DAllocations(world);
  const budget = PHYSICS3D_BENCHMARK_BUDGETS[scenario];
  const p50WallMilliseconds = percentile(wallTimes, 0.5);
  const p95WallMilliseconds = percentile(wallTimes, 0.95);
  const p50CpuMilliseconds = percentile(cpuTimes, 0.5);
  const p95CpuMilliseconds = percentile(cpuTimes, 0.95);
  return {
    backend,
    scenario,
    bodies: world.bodies.length,
    contacts: world.contacts.filter((contact) => contact.touching).length,
    distribution:
      scenario === 'contact-stack'
        ? '8 x 8 footprint, four dynamic box layers over one static floor'
        : '16 x 4 x 4 dynamic boxes separated by eight world units, no contacts',
    p50WallMilliseconds: round(p50WallMilliseconds),
    p95WallMilliseconds: round(p95WallMilliseconds),
    p50CpuMilliseconds: round(p50CpuMilliseconds),
    p95CpuMilliseconds: round(p95CpuMilliseconds),
    sampledAllocationBytesPerStep: round(allocations.sampledPerStep),
    retainedBytesPerStep: round(allocations.retainedPerStep),
    topAllocationSites: allocations.topSites,
    budget,
    passed:
      p95CpuMilliseconds <= budget.p95CpuMilliseconds &&
      allocations.sampledPerStep <= budget.sampledAllocationBytesPerStep &&
      allocations.retainedPerStep <= budget.retainedBytesPerStep,
  };
}

function createPhysics3DBenchmarkWorld(
  backend: Physics3DBenchmarkMeasurement['backend'],
  scenario: Physics3DBenchmarkMeasurement['scenario'],
): Physics3DWorld {
  const index = backend === 'uniform-grid' ? createUniformGridSpatialBackend3D(1.5) : createBvhSpatialBackend3D(0.25);
  const world = createPhysics3DWorld(index);
  world.config.allowSleeping = false;

  if (scenario === 'contact-stack') {
    const floor = createRigidBody3D('static');
    floor.colliders.push(
      createPhysics3DCollider({ kind: 'aabb', minX: -5.5, minY: -0.5, minZ: -5.5, maxX: 5.5, maxY: 0, maxZ: 5.5 }),
    );
    addPhysics3DBody(world, floor);
    for (let layer = 0; layer < 4; layer += 1) {
      for (let row = 0; row < 8; row += 1) {
        for (let column = 0; column < 8; column += 1) {
          const body = createRigidBody3D('dynamic');
          body.x = (column - 3.5) * 1.05;
          body.y = 0.5 + layer * 1.01;
          body.z = (row - 3.5) * 1.05;
          body.colliders.push(createPhysics3DCollider(UNIT_BOX));
          addPhysics3DBody(world, body);
        }
      }
    }
    return world;
  }

  world.gravityY = 0;
  for (let i = 0; i < 256; i += 1) {
    const body = createRigidBody3D('dynamic');
    body.x = (i % 16) * 8;
    body.y = (Math.floor(i / 16) % 4) * 8;
    body.z = Math.floor(i / 64) * 8;
    body.velocityX = (i & 1) === 0 ? 0.1 : -0.1;
    body.colliders.push(createPhysics3DCollider(UNIT_BOX));
    addPhysics3DBody(world, body);
  }
  return world;
}

async function measurePhysics3DAllocations(world: Physics3DWorld): Promise<{
  sampledPerStep: number;
  retainedPerStep: number;
  topSites: { site: string; bytesPerStep: number }[];
}> {
  const collect = globalThis.gc;
  if (collect === undefined) throw new Error('physics3d allocation qualification requires node --expose-gc');
  collect();
  const before = process.memoryUsage().heapUsed;
  for (let step = 0; step < ALLOCATION_STEPS; step += 1) stepPhysics3D(world, TIMESTEP);
  collect();
  const retained = Math.max(0, process.memoryUsage().heapUsed - before);

  const session = new Session();
  session.connect();
  try {
    await session.post('HeapProfiler.enable');
    await session.post('HeapProfiler.startSampling', {
      samplingInterval: ALLOCATION_SAMPLING_INTERVAL,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    for (let step = 0; step < ALLOCATION_STEPS; step += 1) stepPhysics3D(world, TIMESTEP);
    const result = (await session.post('HeapProfiler.stopSampling')) as {
      profile: { head: AllocationProfileNode };
    };
    const sites = new Map<string, number>();
    collectAllocationSites(result.profile.head, sites);
    return {
      sampledPerStep: sumAllocationProfile(result.profile.head) / ALLOCATION_STEPS,
      retainedPerStep: retained / ALLOCATION_STEPS,
      topSites: [...sites]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([site, bytes]) => ({ site, bytesPerStep: round(bytes / ALLOCATION_STEPS) })),
    };
  } finally {
    session.disconnect();
  }
}

function collectAllocationSites(node: Readonly<AllocationProfileNode>, out: Map<string, number>): void {
  if (node.selfSize > 0) {
    const file = node.callFrame.url.split('/').pop() ?? node.callFrame.url;
    const site = `${file}:${node.callFrame.lineNumber + 1} ${node.callFrame.functionName || '(anonymous)'}`;
    out.set(site, (out.get(site) ?? 0) + node.selfSize);
  }
  for (const child of node.children) collectAllocationSites(child, out);
}

function percentile(sorted: readonly number[], quantile: number): number {
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sumAllocationProfile(node: Readonly<AllocationProfileNode>): number {
  let bytes = node.selfSize;
  for (const child of node.children) bytes += sumAllocationProfile(child);
  return bytes;
}

const ALLOCATION_SAMPLING_INTERVAL = 1024;
const ALLOCATION_STEPS = 120;
const SPARSE_WARMUP_STEPS = 60;
const STACK_SETTLE_STEPS = 600;
const TIMED_STEPS = 240;
const TIMESTEP = 1 / 60;
const TIMING_WARMUP_STEPS = 60;

const PHYSICS3D_BENCHMARK_BUDGETS: Record<Physics3DBenchmarkMeasurement['scenario'], Physics3DBenchmarkBudget> = {
  'contact-stack': {
    p95CpuMilliseconds: 12,
    sampledAllocationBytesPerStep: 5 * 1024 * 1024,
    retainedBytesPerStep: 4096,
  },
  'sparse-moving': {
    p95CpuMilliseconds: 2,
    sampledAllocationBytesPerStep: 320 * 1024,
    retainedBytesPerStep: 2048,
  },
};

const UNIT_BOX = {
  kind: 'aabb' as const,
  minX: -0.5,
  minY: -0.5,
  minZ: -0.5,
  maxX: 0.5,
  maxY: 0.5,
  maxZ: 0.5,
};

await main();
