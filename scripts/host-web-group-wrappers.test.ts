import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import * as hostWebContract from '../packages/host-web/src/contract';
import * as hostWebPublic from '../packages/host-web/src/index';

const root = process.cwd();
const HOST_GROUPS = [
  'accessibility',
  'app',
  'clipboard',
  'connectivity',
  'dialog',
  'graphics',
  'input',
  'ipc',
  'media',
  'menu',
  'midi',
  'net',
  'notification',
  'power',
  'protocol',
  'screen',
  'share',
  'shell',
  'shortcut',
  'storage',
  'system',
  'text',
  'tray',
  'ui',
  'updater',
  'window',
] as const;

const WRAPPERS = [
  {
    file: 'webAccessibilityHost.ts',
    group: 'accessibility',
    imports: ['@flighthq/entity/contract', '@flighthq/types/contract', './webAccessibility'],
    name: 'webAccessibilityHost',
    slots: ['provider'],
  },
  {
    file: 'webClipboardHost.ts',
    group: 'clipboard',
    imports: ['@flighthq/entity/contract', '@flighthq/types/contract', './webClipboard'],
    name: 'webClipboardHost',
    slots: ['change', 'formats', 'image', 'text'],
  },
  {
    file: 'webConnectivityHost.ts',
    group: 'connectivity',
    imports: ['@flighthq/entity/contract', '@flighthq/types/contract', './webConnectivity'],
    name: 'webConnectivityHost',
    slots: ['change', 'reachability', 'status'],
  },
  {
    file: 'webDialogHost.ts',
    group: 'dialog',
    imports: ['@flighthq/entity/contract', '@flighthq/types/contract', './webDialog'],
    name: 'webDialogHost',
    slots: ['directoryOpen', 'fileOpen', 'fileSave', 'imageOpen', 'message', 'photoCapture', 'prompt', 'videoCapture'],
  },
  {
    file: 'webGraphicsHost.ts',
    group: 'graphics',
    imports: ['@flighthq/entity/contract', '@flighthq/types/contract', './webInputTarget'],
    name: 'webGraphicsHost',
    slots: ['renderContext', 'renderSurface'],
  },
  {
    file: 'webInputHost.ts',
    group: 'input',
    imports: [
      '@flighthq/entity/contract',
      '@flighthq/types/contract',
      './webHaptics',
      './webInputTarget',
      './webKeyboard',
    ],
    name: 'webInputHost',
    slots: [
      'dropFile',
      'focus',
      'haptics',
      'pointerLock',
      'softKeyboardChange',
      'softKeyboardInfo',
      'softKeyboardVisibility',
      'target',
    ],
  },
  {
    file: 'webMenuHost.ts',
    group: 'menu',
    imports: ['@flighthq/entity/contract', '@flighthq/types/contract', './webMenu'],
    name: 'webMenuHost',
    slots: ['highlight', 'popup'],
  },
  {
    file: 'webShareHost.ts',
    group: 'share',
    imports: ['@flighthq/entity/contract', '@flighthq/types/contract', './webShare'],
    name: 'webShareHost',
    slots: ['content', 'files'],
  },
  {
    file: 'webShellHost.ts',
    group: 'shell',
    imports: ['@flighthq/entity/contract', '@flighthq/types/contract', './webShell'],
    name: 'webShellHost',
    slots: ['external'],
  },
] as const;

describe('host-Web group wrapper boundaries', () => {
  it.each(WRAPPERS)('$name is a public Entity Host with only its truthful Has* slots', (spec) => {
    const wrapper = requiredValue<Record<PropertyKey, any>>(hostWebContract, spec.name);

    expect(Reflect.get(hostWebPublic, spec.name)).toBe(wrapper);
    expect(EntityRuntimeKey in wrapper).toBe(true);
    expect(wrapper[EntityRuntimeKey]).toBeUndefined();
    expect(Object.keys(wrapper[spec.group]).sort()).toEqual(spec.slots);
    expect(requiredValue<Record<string, unknown>>(hostWebContract, 'webHost')[spec.group]).toBe(wrapper[spec.group]);
    for (const group of HOST_GROUPS) {
      if (group !== spec.group) expect(wrapper[group]).toEqual({});
    }
  });

  it.each(WRAPPERS)('$file is isolated to createHost and its own group backends', (spec) => {
    const path = resolve(root, 'packages/host-web/src', spec.file);
    expect(existsSync(path), `${spec.file} source`).toBe(true);
    if (!existsSync(path)) return;
    const source = readFileSync(path, 'utf8');

    expect(collectImportSpecifiers(source).sort()).toEqual([...spec.imports].sort());
    expect(source).toContain(`export const ${spec.name}:`);
    expect(source).toMatch(/=\s*createHost\(\{/);
    expect(source).toMatch(new RegExp(`\\b${spec.group}: \\{`));
  });
});

function collectImportSpecifiers(source: string): string[] {
  return Array.from(source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g), (match) => match[1]!);
}

function requiredValue<Type>(module: object, name: string): Type {
  const value = Reflect.get(module, name);
  expect(value, `${name} export`).not.toBeUndefined();
  return value as Type;
}
