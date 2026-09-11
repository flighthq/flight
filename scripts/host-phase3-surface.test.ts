import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as dialogContract from '../packages/dialog/src/contract';
import * as dialogPublic from '../packages/dialog/src/index';
import * as hostWebContract from '../packages/host-web/src/contract';
import * as hostWebPublic from '../packages/host-web/src/index';

const ROOT = resolve(__dirname, '..');
const PLATFORM_ADAPTERS = ['host-capacitor', 'host-electron', 'host-tauri', 'host-web'] as const;

describe('Host Phase 3 surface', () => {
  it('keeps every platform adapter free of legacy names derived from canonical Host providers', () => {
    const providerNames = collectHostProviderNames();
    const legacyNames = providerNames.map(legacyBackendName);
    legacyNames.push('FileSystemHostBackend', 'VideoCapabilityBackend', 'WgpuHostBackend');

    expect(providerNames.length).toBeGreaterThan(0);
    expect(findLegacyReferences(legacyNames)).toEqual([]);
  });

  it('does not redeclare removed Host aliases, witnesses, or partial web Hosts', () => {
    const typeSources = sourceFiles(resolve(ROOT, 'packages/types/src'))
      .filter((path) => !path.endsWith('.test.ts'))
      .map(readSource)
      .join('\n');
    const hostSource = readSource(resolve(ROOT, 'packages/types/src/Host.ts'));
    const adapterSources = [
      ...sourceFiles(resolve(ROOT, 'packages/host-web/src')),
      ...sourceFiles(resolve(ROOT, 'packages/dialog/src')),
    ].filter((path) => !path.endsWith('.test.ts'));
    const declarations = adapterSources.flatMap(findRemovedRuntimeDeclarations);

    expect(typeSources).not.toMatch(
      /\bexport\s+type\s+[A-Z][A-Za-z0-9]*Backend\s*=\s*Host[A-Z][A-Za-z0-9]*Provider\b/u,
    );
    expect(hostSource).not.toMatch(/\bexport\s+interface\s+Has[A-Z][A-Za-z0-9]*\b/u);
    expect(declarations).toEqual([]);
  });

  it('publishes exactly the same 102 canonical webHost values from both package lanes', () => {
    const publicNames = canonicalWebHostNames(hostWebPublic);
    const contractNames = canonicalWebHostNames(hostWebContract);

    expect(publicNames).toHaveLength(102);
    expect(contractNames).toEqual(publicNames);
    for (const api of [hostWebPublic, hostWebContract, dialogPublic, dialogContract]) {
      const names = Object.keys(api);
      expect(names.filter((name) => /^web[A-Z].*Backend$/u.test(name))).toEqual([]);
      expect(names.filter((name) => /^web(?!Host$)[A-Z].*Host$/u.test(name))).toEqual([]);
      expect(names).not.toContain('webPowerCapabilities');
      expect(names).not.toContain('webScreenCapabilities');
    }
  });
});

function canonicalWebHostNames(api: object): string[] {
  return Object.keys(api)
    .filter((name) => /^webHost(?:$|[A-Z])/u.test(name))
    .sort();
}

function collectHostProviderNames(): string[] {
  const names = new Set<string>();
  const pattern = /\bexport\s+(?:interface|type)\s+(Host[A-Z][A-Za-z0-9]*Provider)\b/gu;
  for (const path of sourceFiles(resolve(ROOT, 'packages/types/src'))) {
    if (path.endsWith('.test.ts')) continue;
    for (const match of readSource(path).matchAll(pattern)) names.add(match[1]);
  }
  return [...names].sort();
}

function legacyBackendName(providerName: string): string {
  return `${providerName.slice('Host'.length, -'Provider'.length)}Backend`;
}

function findLegacyReferences(legacyNames: readonly string[]): string[] {
  const pattern = new RegExp(`\\b(?:${[...new Set(legacyNames)].sort().join('|')})\\b`, 'gu');
  const findings: string[] = [];
  for (const packageName of PLATFORM_ADAPTERS) {
    for (const path of sourceFiles(resolve(ROOT, 'packages', packageName, 'src'))) {
      const source = readSource(path);
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        findings.push(`${relative(ROOT, path)}:${line}: ${match[0]}`);
      }
    }
  }
  return findings.sort();
}

function findRemovedRuntimeDeclarations(path: string): string[] {
  const source = readSource(path);
  const patterns = [
    /\bexport\s+(?:const|let|var)\s+(web[A-Z][A-Za-z0-9]*Backend)\b/gu,
    /\bas\s+(web[A-Z][A-Za-z0-9]*Backend)\b/gu,
    /\bexport\s+(?:const|let|var)\s+(web(?!Host(?:\b|[A-Z]))[A-Z][A-Za-z0-9]*Host)\b/gu,
    /\b(webPowerCapabilities|webScreenCapabilities)\b/gu,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => `${relative(ROOT, path)}: ${match[1]}`),
  );
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
    })
    .sort();
}

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}
