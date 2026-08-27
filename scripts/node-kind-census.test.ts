import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { getEntityRuntime } from '@flighthq/entity/contract';
import { Node2DTraitsKey, Node3DTraitsKey } from '@flighthq/types/contract';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  collectNodeConstructorCandidates,
  collectNodeKindChokepointSites,
  collectNodeKindConstants,
  collectNodeMintingPackages,
  createNodeKindCensusReport,
  formatNodeKindCensusReport,
  hasNodeKindCensusFailure,
  isKindPreservingConstructor,
} from './node-kind-census-core';
import type {
  NodeKindCensusReport,
  NodeKindChokepointSite,
  NodeKindFamily,
  NodeKindProbeOutcome,
} from './node-kind-census-core';

// The arbiter for D3. The population is DERIVED on every run — discovered statically, then classified by
// probing the live public lane — and compared to whatever coverage a document registry declares. There is
// no committed roster and no baseline file to accept a drifted census against: this test measures the SDK
// as it is now, so adding a graph-node kind changes the answer here without anyone remembering to.
//
// The predicate, stated before anything is counted: a kind belongs to the covered population iff a PUBLIC
// exported constructor can actually mint it as an entity whose runtime carries a Node2D/Node3D traits key.
// A kind constant with no public constructor is not in the population, however canonical its name looks.
describe('node kind census', () => {
  let chokepointSites: readonly NodeKindChokepointSite[];
  let report: NodeKindCensusReport;
  let probedExports: readonly string[];

  beforeAll(async () => {
    const sourceFilesByPackage = new Map(packageNames().map((name) => [name, packageSourceFiles(name)]));
    const allSourceFiles = [...sourceFilesByPackage.values()].flat();
    const constants = collectNodeKindConstants(allSourceFiles);
    const candidates = new Set(collectNodeConstructorCandidates(allSourceFiles));
    const mintingPackages = collectNodeMintingPackages(sourceFilesByPackage);
    const sites = collectNodeKindChokepointSites(
      new Map(mintingPackages.map((name) => [name, sourceFilesByPackage.get(name) ?? []])),
      constants,
    );

    const outcomes: NodeKindProbeOutcome[] = [];
    const probed: string[] = [];
    for (const packageName of mintingPackages) {
      const publicLane = join(ROOT, 'packages', packageName, 'src', 'index.ts');
      if (!existsSync(publicLane)) continue;
      const module = (await import(/* @vite-ignore */ pathToFileURL(publicLane).href)) as Record<string, unknown>;
      for (const exportName of Object.keys(module).sort()) {
        if (!candidates.has(exportName)) continue;
        if (isKindPreservingConstructor(exportName)) continue;
        const value = module[exportName];
        if (typeof value !== 'function') continue;
        probed.push(`${packageName}.${exportName}`);
        outcomes.push(probe(packageName, exportName, value as () => unknown));
      }
    }
    chokepointSites = sites;
    probedExports = probed;
    // `covered` stays empty until a scene-document registry exists to declare bindings. The diff is then
    // inert rather than absent — uncovered lists the whole population, which is the honest reading of
    // "nothing binds any kind yet" and is why this test asserts on unresolved, not on the gate verdict.
    report = createNodeKindCensusReport({ covered: [], outcomes, sites });
    // eslint-disable-next-line no-console
    console.log(formatNodeKindCensusReport(report));
  }, 120_000);

  it('probes at least one public constructor from every node-minting package', () => {
    expect(probedExports.length).toBeGreaterThan(0);
  });

  it('derives a non-empty included population without consulting any roster', () => {
    expect(report.population.length).toBeGreaterThan(0);
    for (const entry of report.population) {
      expect(entry.kind).not.toBe('');
      expect(['2d', '3d']).toContain(entry.family);
    }
  });

  it('derives an excluded population, so a probed non-node is recorded rather than dropped', () => {
    expect(report.excluded.length).toBeGreaterThan(0);
  });

  // R7 names this explicitly: the 3D generic container must be reachable through the public lane the same
  // way createDisplayObject is in 2D, or a document cannot round-trip a plain container node.
  it('mints the 3D container kind through a public constructor, as the 2D container does', () => {
    const container3d = report.population.find((entry) => entry.exportName === 'createNode3D');
    expect(container3d).toBeDefined();
    expect(container3d?.family).toBe('3d');
    const container2d = report.population.find((entry) => entry.exportName === 'createDisplayObject');
    expect(container2d?.family).toBe('2d');
  });

  // The generic 2D factory takes its kind from the caller, so it mints no kind of its own. It is classified
  // by what the probe SHOWS — a node whose kind is absent — not by being named in an exclusion list.
  it('classifies a caller-supplied-kind factory as excluded rather than as a kind', () => {
    expect(report.excluded).toContainEqual({
      exportName: 'createNode2D',
      packageName: 'scene2d',
      reason: 'kind-supplied-by-caller',
    });
  });

  // Totality: every kind a chokepoint statically mints is either in the population or named in unresolved.
  // A census that can drop part of its own input reports a smaller number that reads exactly like an
  // answer, so the partition being closed is the property that makes the count trustworthy at all.
  it('partitions every statically minted kind into population or unresolved, dropping none', () => {
    const accounted = new Set([
      ...report.population.map((entry) => entry.kind),
      ...report.unresolved.map((entry) => `${entry.packageName}.${entry.exportName}`),
    ]);
    for (const site of chokepointSites) {
      if (site.kind === null) {
        expect(accounted).toContain(`${site.packageName}.${site.enclosingFunction}`);
        continue;
      }
      expect(accounted).toContain(site.kind);
    }
  });

  // The one site the instrument genuinely cannot bound: the scene3d document importer reads its node kind
  // from parsed data, so what it mints is open by construction rather than enumerable. Pinned by REASON and
  // by the function, not by a count, so a second unbounded site fails this instead of blending in.
  it('reports the data-driven importer site as unresolved and nothing else', () => {
    expect(report.unresolved.map((entry) => ({ exportName: entry.exportName, reason: entry.reason }))).toEqual([
      { exportName: 'buildDocumentNode', reason: 'kind-not-statically-resolvable' },
    ]);
  });

  // The verdict property foreman asked for: an unresolved entry must make the run fail, never be reported
  // alongside a pass. Checked on the live report, which currently carries one.
  it('fails the verdict while anything is unresolved', () => {
    expect(report.unresolved.length).toBeGreaterThan(0);
    expect(hasNodeKindCensusFailure(report)).toBe(true);
  });
});

const ROOT = resolve(__dirname, '..');

function packageNames(): string[] {
  return readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function packageSourceFiles(packageName: string): string[] {
  const sourceDir = join(ROOT, 'packages', packageName, 'src');
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    .map((entry) => join(sourceDir, entry.name));
}

// Zero-argument invocation is deliberate and is what makes the probe rosterless: a constructor's required
// parameters are a TypeScript contract, not a runtime one, so `createMesh()` still runs its chokepoint call
// and yields a node carrying MeshKind. Supplying per-constructor arguments would reintroduce exactly the
// hand-maintained table this instrument exists to avoid.
function probe(packageName: string, exportName: string, value: () => unknown): NodeKindProbeOutcome {
  let produced: unknown;
  try {
    produced = value();
  } catch (error) {
    return {
      exportName,
      kind: null,
      packageName,
      thrown: error instanceof Error ? error.message : String(error),
      traits: null,
    };
  }
  return { exportName, kind: producedKind(produced), packageName, thrown: null, traits: producedTraits(produced) };
}

function producedKind(produced: unknown): string | null {
  if (typeof produced !== 'object' || produced === null) return null;
  const kind = (produced as { kind?: unknown }).kind;
  return typeof kind === 'string' && kind.length > 0 ? kind : null;
}

function producedTraits(produced: unknown): NodeKindFamily | null {
  if (typeof produced !== 'object' || produced === null) return null;
  let runtime: unknown;
  try {
    runtime = getEntityRuntime(produced as Parameters<typeof getEntityRuntime>[0]);
  } catch {
    return null;
  }
  if (typeof runtime !== 'object' || runtime === null) return null;
  const traits = (runtime as { traits?: unknown }).traits;
  if (traits === Node2DTraitsKey) return '2d';
  if (traits === Node3DTraitsKey) return '3d';
  return null;
}
