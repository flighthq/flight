import { existsSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import type { ImportDiagnostic } from '@flighthq/types/contract';

import {
  FIXTURE_RELEASE_TAG,
  FIXTURE_STAMP_FILE,
  isFixturePackMetadataEntry,
  readFixtureTreeStamp,
} from '../../scripts/fixtures';

export interface ConformanceFixturePack {
  id: string;
  verifiedFixtureFiles: number;
}

export interface ConformanceFixtureTree {
  directory: string;
  packs: readonly ConformanceFixturePack[];
  release: string;
  tree: string;
  variant: string;
}

export interface ConformanceFixtureInput {
  absolutePath: string;
  reference: string;
  references: readonly string[];
  tree: Readonly<ConformanceFixtureTree>;
}

export interface ConformanceFixtureObservation {
  diagnostics: readonly Readonly<ImportDiagnostic>[];
  imported: boolean;
  notRunReason?: string;
}

export interface ConformanceFixtureAdapter {
  id: string;
  run(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation>;
  selects(tree: Readonly<ConformanceFixtureTree>, reference: string): boolean;
}

export type ConformanceFixtureState = 'imported' | 'not-run' | 'rejected' | 'threw' | 'unsupported';

export interface ConformanceFixtureResult {
  adapter: string;
  diagnosticKinds: readonly string[];
  diagnostics: Readonly<Record<'Drop' | 'Recover' | 'Reject' | 'Skip', number>>;
  errorName?: string;
  notRunReason?: string;
  packs: readonly string[];
  reference: string;
  state: ConformanceFixtureState;
  tree: string;
  variant: string;
}

export interface RunConformanceFixtureOptions {
  concurrency?: number;
  limit?: number;
}

export function discoverConformanceFixtureTrees(
  cacheDirectory: string,
  release = FIXTURE_RELEASE_TAG,
): ConformanceFixtureTree[] {
  const extracted = join(cacheDirectory, 'extracted');
  if (!existsSync(extracted)) return [];

  const trees: ConformanceFixtureTree[] = [];
  for (const variantEntry of readdirSync(extracted, { withFileTypes: true })) {
    if (!variantEntry.isDirectory()) continue;
    const variantDirectory = join(extracted, variantEntry.name);
    for (const treeEntry of readdirSync(variantDirectory, { withFileTypes: true })) {
      if (!treeEntry.isDirectory()) continue;
      const directory = join(variantDirectory, treeEntry.name);
      const stamp = readFixtureTreeStamp(directory);
      if (stamp === null || stamp.tag !== release || stamp.variant !== variantEntry.name || stamp.packs.length === 0) {
        continue;
      }
      trees.push({
        directory,
        packs: stamp.packs
          .map((pack) => ({ id: pack.pack, verifiedFixtureFiles: pack.verifiedFixtureFiles }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        release: stamp.tag,
        tree: treeEntry.name,
        variant: stamp.variant,
      });
    }
  }
  return trees.sort(compareFixtureTree);
}

export function getConformanceFixtureTreeLabel(tree: Readonly<ConformanceFixtureTree>): string {
  return `${tree.variant}/${basename(tree.directory)}`;
}

export function listConformanceFixtureReferences(treeDirectory: string): string[] {
  const references: string[] = [];
  const pending = [treeDirectory];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const reference = relative(treeDirectory, path).split(sep).join('/');
      if (entry.isDirectory()) {
        if (reference === 'LICENSES') continue;
        pending.push(path);
      } else if (entry.isFile() && reference !== FIXTURE_STAMP_FILE && !isFixturePackMetadataEntry(reference)) {
        references.push(reference);
      }
    }
  }
  return references.sort();
}

export async function runConformanceFixtureAdapters(
  trees: readonly Readonly<ConformanceFixtureTree>[],
  adapters: readonly Readonly<ConformanceFixtureAdapter>[],
  options: Readonly<RunConformanceFixtureOptions> = {},
): Promise<ConformanceFixtureResult[]> {
  const inputs: Array<{ adapter: Readonly<ConformanceFixtureAdapter>; input: ConformanceFixtureInput }> = [];
  for (const tree of trees) {
    const references = listConformanceFixtureReferences(tree.directory);
    for (const reference of references) {
      for (const adapter of adapters) {
        if (!adapter.selects(tree, reference)) continue;
        inputs.push({
          adapter,
          input: { absolutePath: join(tree.directory, ...reference.split('/')), reference, references, tree },
        });
      }
    }
  }
  inputs.sort(compareFixtureInput);
  const selected = options.limit === undefined ? inputs : inputs.slice(0, options.limit);
  const results = new Array<ConformanceFixtureResult>(selected.length);
  let next = 0;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, selected.length));
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = next++;
        const candidate = selected[index];
        if (candidate === undefined) return;
        results[index] = await runConformanceFixtureAdapter(candidate.adapter, candidate.input);
      }
    }),
  );
  return results;
}

async function runConformanceFixtureAdapter(
  adapter: Readonly<ConformanceFixtureAdapter>,
  input: Readonly<ConformanceFixtureInput>,
): Promise<ConformanceFixtureResult> {
  const identity = {
    adapter: adapter.id,
    packs: input.tree.packs.map((pack) => pack.id),
    reference: input.reference,
    tree: input.tree.tree,
    variant: input.tree.variant,
  };
  try {
    const observation = await adapter.run(input);
    const diagnostics = summarizeDiagnostics(observation.diagnostics);
    if (observation.notRunReason !== undefined) {
      return { ...identity, ...diagnostics, notRunReason: observation.notRunReason, state: 'not-run' };
    }
    const rejected = observation.diagnostics.some((diagnostic) => diagnostic.severity === 'Reject');
    const unsupported = observation.diagnostics.some(
      (diagnostic) => diagnostic.severity === 'Reject' && diagnostic.kind.includes('unsupported'),
    );
    return {
      ...identity,
      ...diagnostics,
      state: unsupported ? 'unsupported' : !observation.imported || rejected ? 'rejected' : 'imported',
    };
  } catch (error) {
    return {
      ...identity,
      diagnosticKinds: [],
      diagnostics: { Drop: 0, Recover: 0, Reject: 0, Skip: 0 },
      errorName: error instanceof Error ? error.name : typeof error,
      state: 'threw',
    };
  }
}

function summarizeDiagnostics(
  diagnostics: readonly Readonly<ImportDiagnostic>[],
): Pick<ConformanceFixtureResult, 'diagnosticKinds' | 'diagnostics'> {
  const counts = { Drop: 0, Recover: 0, Reject: 0, Skip: 0 };
  const kinds = new Set<string>();
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
    kinds.add(diagnostic.kind);
  }
  return { diagnosticKinds: [...kinds].sort(), diagnostics: counts };
}

function compareFixtureInput(
  left: Readonly<{ adapter: Readonly<ConformanceFixtureAdapter>; input: ConformanceFixtureInput }>,
  right: Readonly<{ adapter: Readonly<ConformanceFixtureAdapter>; input: ConformanceFixtureInput }>,
): number {
  return (
    compareFixtureTree(left.input.tree, right.input.tree) ||
    left.adapter.id.localeCompare(right.adapter.id) ||
    left.input.reference.localeCompare(right.input.reference)
  );
}

function compareFixtureTree(left: Readonly<ConformanceFixtureTree>, right: Readonly<ConformanceFixtureTree>): number {
  return left.variant.localeCompare(right.variant) || left.tree.localeCompare(right.tree);
}
