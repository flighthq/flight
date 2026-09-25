import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import { createRequirementCodegenPlan } from '@flighthq/requirement-codegen/contract';
import { diffRequirementSets, mergeRequirementSets } from '@flighthq/requirement/contract';
import { parseAwd2Requirements } from '@flighthq/scene3d-formats/contract';
import { parseSwfRequirements } from '@flighthq/swf/contract';
import type { RequirementSet } from '@flighthq/types/contract';

import { readRequirementCatalogFile, readRequirementSetFile, writeRequirementSetFile } from './requirementSetFile.js';

/** Where the tool writes. Injected so the whole CLI is testable without a process or a terminal. */
export interface ManifestToolIO {
  readonly writeError: (message: string) => void;
  readonly writeOutput: (message: string) => void;
}

// This CLI is a thin shell over four things it does not reimplement: the per-format requirement
// analyzers, `mergeRequirementSets`/`diffRequirementSets`, the catalog, and the codegen kernel. It reads
// content directly — the analyzers live in the format packages, so the tool needs no format knowledge of
// its own and gains a format by that package exporting one.
//
// Scalar build settings are deliberately NOT part of a requirement set. A requirement names content the
// producer observed; a scalar is a choice the consumer makes. They stay codegen options so a setting
// can never masquerade as something a file demanded.
const USAGE = `Usage: flight-manifest <command>

  scan     --content <dir> --out <file>
           Analyze every .swf and .awd file in <dir> and merge them into one requirement set.

  merge    --set <file> [--set <file>...] --out <file>
           Merge requirement sets. Requirements union; covers intersect.

  diff     --required <file> --available <file>
           Report requirements not covered by the baseline. Exit 1 when any remain.

  plan     --set <file> --catalog <file> --backend <name> [--out <file>]
           Resolve a requirement set against a catalog into a codegen plan.
`;

export async function runManifestTool(args: readonly string[], io: Readonly<ManifestToolIO>): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    io.writeOutput(USAGE);
    return args.length === 0 ? 1 : 0;
  }

  const [command, ...rest] = args;
  const flags = parseFlags(rest);
  if (flags === null) {
    io.writeError(USAGE);
    return 1;
  }

  try {
    switch (command) {
      case 'diff':
        return await runDiff(flags, io);
      case 'merge':
        return await runMerge(flags, io);
      case 'plan':
        return await runPlan(flags, io);
      case 'scan':
        return await runScan(flags, io);
      default:
        io.writeError(`unknown command: ${command}\n\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    io.writeError(`${(error as Error).message}\n`);
    return 1;
  }
}

type Flags = Readonly<Record<string, readonly string[]>>;

const CONTENT_ANALYZERS: ReadonlyMap<string, (source: Uint8Array) => RequirementSet> = new Map([
  ['.awd', (source: Uint8Array) => parseAwd2Requirements(source, null, null)],
  ['.swf', (source: Uint8Array) => parseSwfRequirements(source, null, null)],
]);

function first(flags: Flags, name: string): string | null {
  const values = flags[name];
  return values === undefined || values.length === 0 ? null : values[values.length - 1];
}

function parseFlags(args: readonly string[]): Flags | null {
  const flags: Record<string, string[]> = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name.startsWith('--') || value === undefined || value.startsWith('--')) return null;
    (flags[name.slice(2)] ??= []).push(value);
  }
  return flags;
}

async function readSet(path: string): Promise<RequirementSet> {
  const validation = readRequirementSetFile(await readFile(path, 'utf8'));
  if (validation.requirementSet === null) throw new Error(`${path}: ${validation.problems.join('; ')}`);
  return validation.requirementSet;
}

async function runDiff(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const required = first(flags, 'required');
  const available = first(flags, 'available');
  if (required === null || available === null) {
    io.writeError(USAGE);
    return 1;
  }
  const missing = diffRequirementSets(await readSet(required), await readSet(available));
  if (missing.requirements.length === 0) {
    io.writeOutput('all requirements are covered\n');
    return 0;
  }
  for (const requirement of missing.requirements) {
    io.writeError(`missing ${requirement.facet} ${requirement.key}\n`);
  }
  return 1;
}

async function runMerge(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const out = first(flags, 'out');
  const paths = flags.set ?? [];
  if (out === null || paths.length === 0) {
    io.writeError(USAGE);
    return 1;
  }
  const sets = [];
  for (const path of paths) sets.push(await readSet(path));
  const merged = mergeRequirementSets(sets);
  await writeFile(out, writeRequirementSetFile(merged), 'utf8');
  io.writeOutput(`${out}: ${merged.requirements.length} requirements over ${merged.covers.length} facets\n`);
  return 0;
}

async function runPlan(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const setPath = first(flags, 'set');
  const catalogPath = first(flags, 'catalog');
  const backend = first(flags, 'backend');
  if (setPath === null || catalogPath === null || backend === null) {
    io.writeError(USAGE);
    return 1;
  }
  const catalogValidation = readRequirementCatalogFile(await readFile(catalogPath, 'utf8'));
  if (catalogValidation.catalog === null) {
    io.writeError(`${catalogPath}: ${catalogValidation.problems.join('; ')}\n`);
    return 1;
  }
  const plan = createRequirementCodegenPlan(catalogValidation.catalog, await readSet(setPath), backend);
  const text = `${JSON.stringify(
    { backend: plan.backend, declined: plan.declined, entries: plan.entries, unresolved: plan.unresolved },
    null,
    2,
  )}\n`;
  const out = first(flags, 'out');
  if (out === null) io.writeOutput(text);
  else await writeFile(out, text, 'utf8');
  // A declined requirement is reported and does NOT fail the plan: the catalog states this backend
  // does not implement it and why, so the build is complete as designed. Printed rather than dropped
  // because a decision nobody can see is indistinguishable from an omission — which is the whole
  // difference this records. Written to the output stream, not the error stream, for the same reason.
  for (const declination of plan.declined) {
    io.writeOutput(`declined ${declination.requirement.facet} ${declination.requirement.key}: ${declination.reason}\n`);
  }
  // Unresolved rows are reported, never dropped: a requirement with no catalog entry is the gap this
  // pipeline exists to make visible before a build silently ships without it.
  if (plan.unresolved.length > 0) {
    for (const requirement of plan.unresolved) {
      io.writeError(`unresolved ${requirement.facet} ${requirement.key}\n`);
    }
    return 1;
  }
  return 0;
}

async function runScan(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const dir = first(flags, 'content');
  const out = first(flags, 'out');
  if (dir === null || out === null) {
    io.writeError(USAGE);
    return 1;
  }
  const names = (await readdir(dir)).filter((name) => CONTENT_ANALYZERS.has(extname(name).toLowerCase())).sort();
  const sets: RequirementSet[] = [];
  for (const name of names) {
    const analyze = CONTENT_ANALYZERS.get(extname(name).toLowerCase())!;
    sets.push(analyze(new Uint8Array(await readFile(join(dir, name)))));
  }
  const merged = mergeRequirementSets(sets);
  await writeFile(out, writeRequirementSetFile(merged), 'utf8');
  io.writeOutput(`${out}: ${names.length} files, ${merged.requirements.length} requirements\n`);
  return 0;
}
