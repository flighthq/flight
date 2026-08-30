import { readFileSync, readdirSync, statSync } from 'node:fs';
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
    .filter((path) => !path.includes('/dist/') && path.endsWith('.ts') && !path.endsWith('.test.ts'))
    .map((path) => ({ contents: readFileSync(path, 'utf8'), path: relative(ROOT, path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
