import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as hostWebContract from '../packages/host-web/src/contract';
import * as hostWebPublic from '../packages/host-web/src/index';

const root = process.cwd();
const GROUP_MODULES = [
  { file: 'webAccessibilityHost.ts', group: 'accessibility', name: 'webHostAccessibilityGroup' },
  { file: 'webAppHost.ts', group: 'app', name: 'webHostApp' },
  { file: 'webClipboardHost.ts', group: 'clipboard', name: 'webHostClipboard' },
  { file: 'webConnectivityHost.ts', group: 'connectivity', name: 'webHostConnectivity' },
  { file: 'webDialogHost.ts', group: 'dialog', name: 'webHostDialog' },
  { file: 'webGraphicsHost.ts', group: 'graphics', name: 'webHostGraphics' },
  { file: 'webInputHost.ts', group: 'input', name: 'webHostInput' },
  { file: 'webMediaHost.ts', group: 'media', name: 'webHostMedia' },
  { file: 'webMenuHost.ts', group: 'menu', name: 'webHostMenu' },
  { file: 'webProtocolHost.ts', group: 'protocol', name: 'webHostProtocol' },
  { file: 'webShareHost.ts', group: 'share', name: 'webHostShare' },
  { file: 'webShellHost.ts', group: 'shell', name: 'webHostShell' },
  { file: 'webStorageHost.ts', group: 'storage', name: 'webHostStorageGroup' },
  { file: 'webSystemHost.ts', group: 'system', name: 'webHostSystem' },
  { file: 'webUiHost.ts', group: 'ui', name: 'webHostUi' },
] as const;

describe('host-Web canonical group boundaries', () => {
  it.each(GROUP_MODULES)('$name is the public group identity composed by webHost', (spec) => {
    const group = requiredValue<Record<string, unknown>>(hostWebContract, spec.name);

    expect(Reflect.get(hostWebPublic, spec.name)).toBe(group);
    expect(requiredValue<Record<string, unknown>>(hostWebContract, 'webHost')[spec.group]).toBe(group);
    expect(Object.keys(group).length).toBeGreaterThan(0);
  });

  it.each(GROUP_MODULES)('$file declares a group without constructing a partial Host', (spec) => {
    const path = resolve(root, 'packages/host-web/src', spec.file);
    expect(existsSync(path), `${spec.file} source`).toBe(true);
    if (!existsSync(path)) return;
    const source = readFileSync(path, 'utf8');

    expect(source).toContain(`export const ${spec.name} = {`);
    expect(source).not.toContain('createHost');
    expect(source).not.toMatch(/^export const web(?!Host)[A-Z]\w*Host\b/mu);
  });
});

function requiredValue<Type>(module: object, name: string): Type {
  const value = Reflect.get(module, name);
  expect(value, `${name} export`).not.toBeUndefined();
  return value as Type;
}
