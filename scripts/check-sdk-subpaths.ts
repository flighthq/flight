// Keeps the SDK's per-package subpaths in step with the packages it actually re-exports. Three
// artifacts have to agree for `@flighthq/sdk/<name>` to resolve: the root re-export in `index.ts`, a
// one-line barrel at `src/<name>.ts`, and an `exports` entry in the manifest. Nothing fails loudly
// when they drift — a missing barrel is a resolution error only for the consumer who imports that
// subpath, and a stale entry points at a `dist` file the build never emits — so the agreement is
// asserted here instead of discovered downstream.
//
// The package population is derived from `index.ts` on every run rather than from a roster, so adding
// a package to the SDK is the only edit required to bring it under this gate.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { formatGateProvenance, readGateTreeState } from './gate-provenance';

export type SdkSubpathDefectKind = 'barrel-content' | 'barrel-missing' | 'exports-entry' | 'exports-orphan';

export interface SdkSubpathDefect {
  detail: string;
  kind: SdkSubpathDefectKind;
  name: string;
}

export interface SdkSubpathReport {
  defects: readonly SdkSubpathDefect[];
  packages: readonly string[];
}

export function createEmptySdkSubpathReport(): SdkSubpathReport {
  return { defects: [], packages: [] };
}

// The two lanes that are not per-package barrels and must keep their hand-written entries.
const RESERVED_SUBPATHS = new Set(['.', './contract']);

export function checkSdkSubpaths(sdkRoot: string): SdkSubpathReport {
  const packages = readSdkPackageNames(resolve(sdkRoot, 'src/index.ts'));
  const manifest = JSON.parse(readFileSync(resolve(sdkRoot, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>;
  };
  const exportsField = manifest.exports ?? {};
  const defects: SdkSubpathDefect[] = [];

  for (const name of packages) {
    const barrelPath = resolve(sdkRoot, `src/${name}.ts`);
    if (!existsSync(barrelPath)) {
      defects.push({ detail: `src/${name}.ts does not exist`, kind: 'barrel-missing', name });
    } else {
      const expected = `export * from '@flighthq/${name}';`;
      const actual = readFileSync(barrelPath, 'utf8').replace(/^﻿/, '').trim();
      if (actual !== expected) {
        defects.push({ detail: `src/${name}.ts must be exactly ${expected}`, kind: 'barrel-content', name });
      }
    }

    const entry = exportsField[`./${name}`] as { default?: string; types?: string } | undefined;
    if (entry === undefined) {
      defects.push({ detail: `exports is missing "./${name}"`, kind: 'exports-entry', name });
      continue;
    }
    if (entry.types !== `./dist/${name}.d.ts` || entry.default !== `./dist/${name}.js`) {
      defects.push({
        detail: `exports["./${name}"] must point at ./dist/${name}.d.ts and ./dist/${name}.js`,
        kind: 'exports-entry',
        name,
      });
    }
  }

  const declared = new Set(packages);
  for (const subpath of Object.keys(exportsField)) {
    if (RESERVED_SUBPATHS.has(subpath)) continue;
    const name = subpath.replace(/^\.\//, '');
    if (declared.has(name)) continue;
    defects.push({
      detail: `exports declares "${subpath}" but index.ts re-exports no @flighthq/${name}`,
      kind: 'exports-orphan',
      name,
    });
  }

  return { defects: defects.sort(compareDefects), packages };
}

// Derived from the re-export list rather than the directory, so a stray file in src/ is an orphan
// rather than a package. The BOM is stripped first: left in place it makes the first re-export
// unmatchable, and the gate would then silently police one package fewer than the SDK ships.
export function readSdkPackageNames(indexPath: string): string[] {
  const text = readFileSync(indexPath, 'utf8').replace(/^﻿/, '');
  const names = [...text.matchAll(/^export \* from '@flighthq\/([a-z0-9-]+)';$/gm)].map((match) => match[1]);
  const declared = (text.match(/^export \* from '@flighthq\//gm) ?? []).length;
  if (names.length !== declared) {
    throw new Error(`parsed ${names.length} SDK re-exports but index.ts declares ${declared}`);
  }
  return names;
}

export function formatSdkSubpathReport(report: Readonly<SdkSubpathReport>): string {
  const passed = report.defects.length === 0;
  const lines = [
    formatGateProvenance(
      {
        command: 'npm run check:sdk-subpaths (scripts/check-sdk-subpaths.ts)',
        counting:
          'one unit = one package re-exported by packages/sdk/src/index.ts; a defect is one missing or mismatched barrel file or exports entry, or one exports entry naming a package the root does not re-export',
        scope:
          'the package list is derived from index.ts on every run, never from a roster; the "." and "./contract" lanes are reserved and not per-package barrels',
      },
      readGateTreeState(process.cwd()),
    ),
    `${passed ? pc.green('OK') : pc.yellow('!')} ${pc.bold('Every SDK package has a matching subpath barrel and exports entry')} ${pc.dim(`(${report.packages.length} packages re-exported, ${report.defects.length} defect${report.defects.length === 1 ? '' : 's'})`)}`,
  ];
  if (!passed) {
    lines.push('');
    for (const defect of report.defects) lines.push(`  - ${defect.kind} ${defect.name}: ${defect.detail}`);
    lines.push(
      '',
      '  Add a package to packages/sdk/src/index.ts and it needs both a one-line src/<name>.ts barrel and an exports entry; remove one and the entry goes too.',
    );
  }
  return lines.join('\n');
}

function compareDefects(a: Readonly<SdkSubpathDefect>, b: Readonly<SdkSubpathDefect>): number {
  return a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const report = checkSdkSubpaths(resolve(root, 'packages/sdk'));
  console.log(formatSdkSubpathReport(report));
  if (report.defects.length > 0) process.exitCode = 1;
}
