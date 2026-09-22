import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AnalysisMappings } from './contentAnalysis.js';
import { contentToManifest, readContentAnalysis } from './contentAnalysis.js';
import { diffManifest, isManifestDiffSatisfied } from './diffManifest.js';
import { unionManifests } from './extendManifest.js';
import { generateManifestSource } from './generateManifestSource.js';
import type { Manifest } from './manifest.js';
import { createManifest, readManifest, writeManifest } from './manifest.js';
import type { ManifestImportRegistry } from './manifestImports.js';
import { resolveManifestImports } from './manifestImports.js';

/** Where the tool writes. Injected so the whole CLI is testable without a process or a terminal. */
export interface ManifestToolIO {
  readonly writeError: (message: string) => void;
  readonly writeOutput: (message: string) => void;
}

// WHY THERE IS NO CONTENT PARSER HERE. Turning a .swf or .awd into observations is a DOMAIN job, and
// domain analyzers are deliberately out of this package's scope. So `scan` consumes analyses a domain
// already produced and serialized, and `analyze` maps one such analysis through a caller-supplied
// mapping. Both are honest with no format knowledge whatsoever; neither pretends to read content. A
// domain plugs in by writing ContentAnalysis JSON, which is the documented seam.
const USAGE = `Usage: flight-manifest <command>

  scan     --analyses <dir> --out <file>
           Union every *.json content analysis in <dir> into one manifest.
           Analyses are produced by DOMAIN analyzers; this tool does not read content itself.

  analyze  --analysis <file> --mapping <file> [--out <file>]
           Map one content analysis through a mapping into a manifest.

  union    --manifest <file> [--manifest <file>...] --out <file>
           Fold manifests left to right: features union, later settings win.

  diff     --required <file> --available <file>
           Report supported, unused and missing features. Exit 1 when anything is missing.

  generate --manifest <file> --registry <file> --out <file>
           Emit a TypeScript module importing exactly the required features.
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
      case 'scan':
        return await runScan(flags, io);
      case 'analyze':
        return await runAnalyze(flags, io);
      case 'union':
        return await runUnion(flags, io);
      case 'diff':
        return await runDiff(flags, io);
      case 'generate':
        return await runGenerate(flags, io);
      default:
        io.writeError(USAGE);
        return 1;
    }
  } catch (error) {
    io.writeError(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function runScan(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const directory = single(flags, 'analyses');
  const out = single(flags, 'out');
  if (directory === null || out === null) return usageError(io);

  const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();

  const manifests: Manifest[] = [];
  for (const file of files) {
    const validation = readContentAnalysis(await readFile(file, 'utf8'));
    if (validation.analysis === null) return problemsError(io, file, validation.problems);
    // No mappings at scan time: an analysis is unioned as the observations it already is, so `scan`
    // reports what content contains without deciding what any of it requires.
    manifests.push(createManifest(validation.analysis.observations));
  }

  await writeFile(out, writeManifest(unionManifests(manifests)), 'utf8');
  io.writeOutput(`${files.length} analysis file(s) -> ${out}\n`);
  return 0;
}

async function runAnalyze(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const analysisPath = single(flags, 'analysis');
  const mappingPath = single(flags, 'mapping');
  if (analysisPath === null || mappingPath === null) return usageError(io);

  const validation = readContentAnalysis(await readFile(analysisPath, 'utf8'));
  if (validation.analysis === null) return problemsError(io, analysisPath, validation.problems);

  const mappings = JSON.parse(await readFile(mappingPath, 'utf8')) as AnalysisMappings;
  const result = contentToManifest(validation.analysis, mappings);
  for (const unmapped of result.unmapped) io.writeError(`unmapped: ${unmapped}\n`);

  const out = single(flags, 'out');
  if (out === null) io.writeOutput(writeManifest(result.manifest));
  else await writeFile(out, writeManifest(result.manifest), 'utf8');
  // Unmapped observations are reported but not fatal: a domain still growing its mapping is a normal
  // state, and the caller decides whether shipping without those features is acceptable.
  return 0;
}

async function runUnion(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const paths = flags.get('manifest') ?? [];
  const out = single(flags, 'out');
  if (paths.length === 0 || out === null) return usageError(io);

  const manifests: Manifest[] = [];
  for (const path of paths) {
    const validation = readManifest(await readFile(path, 'utf8'));
    if (validation.manifest === null) return problemsError(io, path, validation.problems);
    manifests.push(validation.manifest);
  }

  await writeFile(out, writeManifest(unionManifests(manifests)), 'utf8');
  io.writeOutput(`${manifests.length} manifest(s) -> ${out}\n`);
  return 0;
}

async function runDiff(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const requiredPath = single(flags, 'required');
  const availablePath = single(flags, 'available');
  if (requiredPath === null || availablePath === null) return usageError(io);

  const required = readManifest(await readFile(requiredPath, 'utf8'));
  if (required.manifest === null) return problemsError(io, requiredPath, required.problems);
  const available = readManifest(await readFile(availablePath, 'utf8'));
  if (available.manifest === null) return problemsError(io, availablePath, available.problems);

  const diff = diffManifest(required.manifest, available.manifest);
  io.writeOutput(`${JSON.stringify(diff, null, 2)}\n`);
  return isManifestDiffSatisfied(diff) ? 0 : 1;
}

async function runGenerate(flags: Flags, io: Readonly<ManifestToolIO>): Promise<number> {
  const manifestPath = single(flags, 'manifest');
  const registryPath = single(flags, 'registry');
  const out = single(flags, 'out');
  if (manifestPath === null || registryPath === null || out === null) return usageError(io);

  const validation = readManifest(await readFile(manifestPath, 'utf8'));
  if (validation.manifest === null) return problemsError(io, manifestPath, validation.problems);

  const registry = JSON.parse(await readFile(registryPath, 'utf8')) as ManifestImportRegistry;
  const resolution = resolveManifestImports(validation.manifest, registry);
  if (resolution.missing.length > 0) {
    for (const missing of resolution.missing) io.writeError(`no import for: ${missing}\n`);
    // Fatal, unlike an unmapped observation: a generated file that quietly omits a required feature is
    // a build that is wrong in a way nothing downstream can detect.
    return 1;
  }

  await writeFile(
    out,
    generateManifestSource(resolution.entries, {
      banner: ['// Generated by flight-manifest. Do not edit.'],
    }),
    'utf8',
  );
  io.writeOutput(`${out}\n`);
  return 0;
}

type Flags = Map<string, string[]>;

function parseFlags(args: readonly string[]): Flags | null {
  const flags: Flags = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === undefined || !flag.startsWith('--') || value === undefined || value.startsWith('--')) return null;
    const name = flag.slice(2);
    const existing = flags.get(name);
    if (existing === undefined) flags.set(name, [value]);
    else existing.push(value);
  }
  return flags;
}

function single(flags: Flags, name: string): string | null {
  const values = flags.get(name);
  return values === undefined || values.length !== 1 ? null : values[0]!;
}

function problemsError(io: Readonly<ManifestToolIO>, path: string, problems: readonly string[]): number {
  for (const problem of problems) io.writeError(`${path}: ${problem}\n`);
  return 1;
}

function usageError(io: Readonly<ManifestToolIO>): number {
  io.writeError(USAGE);
  return 1;
}
