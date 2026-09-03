import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

describe('MIDI explicit Host capability shape', () => {
  it('publishes one required group with only split access and permission slots and exact traits', () => {
    const host = source('packages/types/src/Host.ts');
    expect(host).toContain('readonly midi: HostMidiCapabilities;');
    const body = interfaceBody(host, 'HostMidiCapabilities');
    expect(propertyNames(body)).toEqual(['access', 'permission']);
    expect(body).toContain('readonly access?: MidiAccessBackend;');
    expect(body).toContain('readonly permission?: MidiPermissionBackend;');
    expect(host).toContain('export interface HasMidiAccess');
    expect(host).toContain('export interface HasMidiPermission');
  });

  it('keeps native Web MIDI types in the injected Web adapter and out of Permissions', () => {
    const permissions = productionSources('packages/permissions/src');
    expect(permissions).not.toMatch(/\b(?:MIDIAccess|MIDIInput|MIDIOptions|MIDIOutput|requestMIDIAccess)\b/u);

    const adapter = source('packages/host-web/src/webMidi.ts');
    expect(adapter).toContain("Pick<Navigator, 'requestMIDIAccess'>");
    expect(adapter).toContain("Pick<Navigator, 'permissions' | 'requestMIDIAccess'>");
    expect(adapter).not.toContain('globalThis');
    expect(adapter).not.toMatch(/\bnavigator\s*\./u);
  });

  it('constructs exact injected profiles while the default Web Host remains unable to request hardware', () => {
    const adapter = source('packages/host-web/src/webMidi.ts');
    expect(adapter).toContain('export function createWebMidiAccessCapabilities');
    expect(adapter).toContain('export function createWebMidiPermissionAccessCapabilities');
    expect(adapter).toMatch(/requestMIDIAccess\(\)/u);
    expect(adapter).not.toMatch(/requestMIDIAccess\s*\(\s*\{/u);
    expect(adapter).not.toContain('sysex: true');

    const defaultHost = source('packages/host-web/src/webHost.ts');
    expect(defaultHost).toMatch(/midi:\s*\{\}/u);
    expect(defaultHost).not.toContain('requestMIDIAccess');

    const implementation = productionSources('packages/midi/src');
    expect(`${adapter}\n${implementation}`).not.toMatch(
      /\b(?:queueMicrotask|requestAnimationFrame|setInterval|setTimeout)\s*\(/u,
    );
  });

  it('has one production request owner and makes Permissions MIDI requestless', () => {
    const requestOwners = productionTypeScriptFiles('packages')
      .filter(({ contents }) => contents.includes('requestMIDIAccess'))
      .map(({ path }) => path);
    expect(requestOwners).toEqual(['packages/host-web/src/webMidi.ts']);

    const permission = source('packages/permissions/src/permission.ts');
    expect(permission).toMatch(/(?:name === 'midi'|case 'midi':)[\s\S]{0,120}reason: 'no-request-route'/u);
    expect(permission).not.toContain('requestWebMidiPermission');
  });

  it('keeps public MIDI resources entity-based and operations origin-keyed rather than id-routed', () => {
    const types = source('packages/types/src/Midi.ts');
    for (const resource of ['MidiAccess', 'MidiInputPort', 'MidiOutputPort']) {
      expect(types).toMatch(new RegExp(`export interface ${resource} extends Entity`, 'u'));
    }
    expect(types).not.toMatch(/(?:find|lookup|resolve).*Midi.*(?:id|Id)/u);

    const implementation = productionSources('packages/midi/src');
    expect(implementation).toContain('WeakMap<');
    expect(implementation).not.toMatch(/Map<string,\s*Midi/u);
  });
});

function interfaceBody(contents: string, name: string): string {
  const match = new RegExp(`export interface ${name} \\{([\\s\\S]*?)^\\}`, 'mu').exec(contents);
  expect(match, `${name} declaration`).not.toBeNull();
  return match?.[1] ?? '';
}

function propertyNames(body: string): string[] {
  return [...body.matchAll(/readonly\s+([A-Za-z_$][\w$]*)\??:/gu)].map((match) => match[1]).sort();
}

function productionSources(directory: string): string {
  return productionTypeScriptFiles(directory)
    .map(({ contents }) => contents)
    .join('\n');
}

function productionTypeScriptFiles(directory: string): Array<{ contents: string; path: string }> {
  const absolute = resolve(ROOT, directory);
  return walk(absolute)
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
    .map((path) => ({ contents: readFileSync(path, 'utf8'), path: relative(ROOT, path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

// Build output and installed dependencies cannot hold the production source these assertions are about,
// and descending into them was most of the traversal: of 24,730 paths this walk visited under packages/,
// 19,244 were dist output that existed only to be filtered out afterwards, against 3,153 kept. Pruning at
// the directory keeps the work proportional to the subject and makes the result independent of whether
// the repository happens to have been built — the walk is the whole cost of this file, and under the
// shared-worker suite it was overrunning the 5s deadline. Reading entry types from readdir also drops one
// statSync per visited path.
//
// The prune is load-bearing for CORRECTNESS, not only cost: emitted declarations under dist/ end in .ts
// and are not .test.ts, so they satisfy the production-source filter. Removing this prune readmits every
// .d.ts as production source and the request-owner assertion starts failing on build output.
const SKIPPED_DIRECTORIES = new Set(['dist', 'node_modules']);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (!entry.isDirectory()) return [path];
    return SKIPPED_DIRECTORIES.has(entry.name) ? [] : walk(path);
  });
}

// The walk is what made this file the slowest in the suite, and the defect was where it went rather than
// how long it took: it descended into every package's build output and filtered the results away after
// paying for them. Asserting the traversal never enters those directories is deterministic, unlike a
// timing bound, and it fails on the traversal that caused the timeout.
describe('production source traversal', () => {
  it('never descends into build output or installed dependencies', () => {
    const visited = walk(resolve(ROOT, 'packages'));
    expect(visited.filter((path) => path.includes('/dist/'))).toEqual([]);
    expect(visited.filter((path) => path.includes('/node_modules/'))).toEqual([]);
  });

  it('still reaches package production sources', () => {
    expect(productionTypeScriptFiles('packages/midi/src').map(({ path }) => path)).toContain(
      'packages/midi/src/midiAccess.ts',
    );
  });
});
