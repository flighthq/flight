import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  collectWholeBackendTeardowns,
  createBackendLifecycleReport,
  formatBackendLifecycleReport,
  hasBackendLifecycleFailure,
} from './backend-lifecycle-core';
import type { BackendLifecycleReport } from './backend-lifecycle-core';
import { collectBackendInterfaceNames } from './backend-operation-seam-core';

// P4's replacement-lifetime census. Population and exclusions are both derived: a backend can only leak a
// resource it owns, and ownership is the interface declaring a NO-ARGUMENT `destroy()`/`dispose()`.
describe('backend replacement lifetime census', () => {
  let report: BackendLifecycleReport;
  let teardowns: ReadonlyMap<string, string>;

  beforeAll(() => {
    const typeFiles = packageSourceFiles('types');
    expect(typeFiles.length).toBeGreaterThan(0);
    const names = collectBackendInterfaceNames(typeFiles).map((name) => `${name}Backend`);
    teardowns = collectWholeBackendTeardowns(typeFiles);
    report = createBackendLifecycleReport(names, teardowns, collectSetterBodies());
    // eslint-disable-next-line no-console
    console.log(formatBackendLifecycleReport(report));
  });

  it('prints both counts and holds the partition', () => {
    expect(report.total).toBeGreaterThan(0);
    expect(report.enforced + report.noTeardownHook).toBe(report.total);
  });

  // ★ The exclusion, asserted rather than assumed. A per-object teardown frees one item, not the backend,
  // so these must NOT be counted as owning a freeable resource — otherwise the census reports leaks for
  // backends that have nothing to free and the gate is noise from its first run.
  it('excludes per-object teardowns, which free an item rather than the backend', () => {
    expect(teardowns.has('TrayBackend')).toBe(false);
    expect(teardowns.has('WindowBackend')).toBe(false);
    expect(teardowns.has('NotificationBackend')).toBe(false);
  });

  it('includes the whole-backend teardown that does exist', () => {
    expect(teardowns.get('LogTransportBackend')).toBe('destroy');
  });

  // The ratchet: replacement must free what the outgoing backend held, for every backend that owns
  // anything. Green today because one backend does; it tightens by itself as teardown hooks are added.
  it('reports no leak among the backends that own a freeable resource', () => {
    expect(report.violations).toEqual([]);
    expect(hasBackendLifecycleFailure(report)).toBe(false);
  });
});

// ★ THE SYNTAX BLIND SPOT, pinned with a fixture. A backend member may be declared as a METHOD
// (`destroy(): void`) or as a PROPERTY with a function type (`destroy?: () => void`), and the two are
// different AST nodes. Reading only method signatures is not hypothetical — `TextShaperBackend` already
// declares all six of its optional operations in property form, so a method-only reader misses them
// while still printing a confident green. Both forms must be found, and arity must still decide.
describe('collectWholeBackendTeardowns member syntax', () => {
  it('finds a zero-parameter teardown in either declaration syntax, and rejects a parameterised one', () => {
    const fixture = join(mkdtempSync(join(tmpdir(), 'backend-lifecycle-')), 'BackendSyntaxFixture.ts');
    writeFileSync(
      fixture,
      [
        'export interface MethodFormBackend { destroy(): void; }',
        'export interface PropertyFormBackend { destroy?: () => void; }',
        'export interface PerObjectMethodBackend { destroy(id: number): void; }',
        'export interface PerObjectPropertyBackend { destroy?: (id: number) => void; }',
        'export interface NoTeardownBackend { write(line: string): void; }',
      ].join('\n'),
      'utf-8',
    );

    const found = collectWholeBackendTeardowns([fixture]);
    expect(found.get('MethodFormBackend')).toBe('destroy');
    expect(found.get('PropertyFormBackend')).toBe('destroy');
    expect(found.has('PerObjectMethodBackend')).toBe(false);
    expect(found.has('PerObjectPropertyBackend')).toBe(false);
    expect(found.has('NoTeardownBackend')).toBe(false);
  });
});

const ROOT = resolve(__dirname, '..');

// Every exported `set*Backend` in the repo, mapped to its body text.
function collectSetterBodies(): ReadonlyMap<string, string> {
  const bodies = new Map<string, string>();
  for (const packageName of packageNames()) {
    for (const file of packageSourceFiles(packageName)) {
      const text = readFileSync(file, 'utf-8');
      const pattern = /^export function (set\w*Backend)\([^)]*\)[^{]*\{/gm;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const open = text.indexOf('{', match.index);
        let depth = 0;
        let end = open;
        for (; end < text.length; end++) {
          if (text[end] === '{') depth++;
          else if (text[end] === '}' && --depth === 0) break;
        }
        bodies.set(match[1], text.slice(open + 1, end));
      }
    }
  }
  return bodies;
}

function packageNames(): string[] {
  return readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'packages', entry.name, 'package.json')))
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
