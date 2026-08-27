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
  let publicExports: ReadonlyMap<string, ReadonlySet<string>>;
  let report: NodeKindCensusReport;
  let probedExports: readonly string[];

  beforeAll(async () => {
    const sourceFilesByPackage = new Map(packageNames().map((name) => [name, packageSourceFiles(name)]));
    const allSourceFiles = [...sourceFilesByPackage.values()].flat();
    const constants = collectNodeKindConstants(allSourceFiles);
    const candidates = new Set(collectNodeConstructorCandidates(allSourceFiles));
    const mintingPackages = collectNodeMintingPackages(sourceFilesByPackage);

    // The public lane is enumerated FIRST, because it is the gate for both halves of the census: only a
    // name the package's `index.ts` exports may enter any population, whether by probe or by static site.
    const publicExportsByPackage = new Map<string, ReadonlySet<string>>();
    const modules = new Map<string, Record<string, unknown>>();
    for (const packageName of mintingPackages) {
      const publicLane = join(ROOT, 'packages', packageName, 'src', 'index.ts');
      if (!existsSync(publicLane)) continue;
      const module = (await import(/* @vite-ignore */ pathToFileURL(publicLane).href)) as Record<string, unknown>;
      modules.set(packageName, module);
      publicExportsByPackage.set(packageName, new Set(Object.keys(module)));
    }

    const sites = collectNodeKindChokepointSites(
      new Map(mintingPackages.map((name) => [name, sourceFilesByPackage.get(name) ?? []])),
      constants,
      publicExportsByPackage,
    );

    const outcomes: NodeKindProbeOutcome[] = [];
    const probed: string[] = [];
    for (const [packageName, module] of modules) {
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
    publicExports = publicExportsByPackage;
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

  // THE PRIVATE-HELPER ARM against the real repo, stated as a property over the WHOLE report rather than
  // about any one function: every name in every population must be something its package's public lane
  // actually exports. `buildDocumentNode` in scene3d/sceneDocument.ts is the case that exposed this — a
  // module-private helper that calls a chokepoint with a kind read from parsed data, which used to fail the
  // census on a function no consumer can call — but nothing here is written in terms of it.
  it('admits nothing to any population that its package does not publicly export', () => {
    const reported = [
      ...report.population.map((entry) => ({ exportName: entry.exportName, packageName: entry.packageName })),
      ...report.excluded.map((entry) => ({ exportName: entry.exportName, packageName: entry.packageName })),
      ...report.unresolved.map((entry) => ({ exportName: entry.exportName, packageName: entry.packageName })),
    ];
    expect(reported.length).toBeGreaterThan(0);
    for (const entry of reported) {
      expect(publicExports.get(entry.packageName) ?? new Set()).toContain(entry.exportName);
    }
  });

  // With internal helpers correctly out of scope, every remaining chokepoint mint resolves, so the live
  // census is clean. Asserted as an empty set rather than a count so a new unbounded site fails here.
  it('leaves nothing unresolved once discovery is limited to public constructors', () => {
    expect(report.unresolved).toEqual([]);
    expect(hasNodeKindCensusFailure({ ...report, uncovered: [], unresolved: [] })).toBe(false);
  });

  // The verdict property still has to hold, so it is checked on a report that DOES carry an unresolved
  // entry. Proving it on live data is no longer possible now that the live data is clean, and a property
  // nothing exercises is a property nothing protects.
  it('fails the verdict whenever anything is unresolved', () => {
    const withUnresolved = {
      ...report,
      unresolved: [
        {
          detail: 'synthetic',
          exportName: 'createSomething',
          packageName: 'scene2d',
          reason: 'kind-not-statically-resolvable' as const,
        },
      ],
    };
    expect(hasNodeKindCensusFailure(withUnresolved)).toBe(true);
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
