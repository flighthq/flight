import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = 'scripts/host-electron-canonical-surface.test.ts';
const LEGACY =
  /\b(?:ElectronBackendOptions|createElectron[A-Za-z0-9]*(?:Backend|Backends|Capabilities)|initializeElectron[A-Za-z0-9]*(?:Backend|Backends|Capabilities)|initialize(?:App|Menu|Power|Protocol|Screen|Shell|Tray)[A-Za-z0-9]*Backend|makeElectronShellCapabilities|registerElectronBackends)\b/gu;

describe('Electron canonical Host surface', () => {
  it('keeps removed constructor and registrar names out of source, tests, examples, and prose', () => {
    const findings: string[] = [];
    for (const path of repositoryFiles()) {
      const file = relative(ROOT, path);
      if (file === SELF) continue;
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(LEGACY)) {
        const line = source.slice(0, match.index).split('\n').length;
        findings.push(`${file}:${line}: ${match[0]}`);
      }
    }
    expect(findings.sort()).toEqual([]);
  });

  it('does not retain the legacy options module', () => {
    expect(existsSync(resolve(ROOT, 'packages/types/src/ElectronBackendOptions.ts'))).toBe(false);
  });
});

function repositoryFiles(): string[] {
  return ['packages', 'examples', 'scripts', 'tools'].flatMap((directory) => sourceFiles(resolve(ROOT, directory)));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === 'dist' || entry.name === 'node_modules' ? [] : sourceFiles(path);
      if (!entry.isFile()) return [];
      return /\.(?:json|md|mdx|ts|tsx)$/u.test(entry.name) ? [path] : [];
    })
    .sort();
}
