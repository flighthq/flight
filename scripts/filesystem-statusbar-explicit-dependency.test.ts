import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import * as filesystem from '../packages/filesystem/src/contract';
import * as hostWeb from '../packages/host-web/src/contract';
import * as statusbar from '../packages/statusbar/src/contract';

const root = process.cwd();
const filesystemSource = readFileSync(resolve(root, 'packages/filesystem/src/filesystem.ts'), 'utf8');
const statusbarSource = readFileSync(resolve(root, 'packages/statusbar/src/statusbar.ts'), 'utf8');

describe('Filesystem and Statusbar explicit dependency ownership', () => {
  it('routes one filesystem call through the Host value passed at that call site', async () => {
    const readTextFile = requiredFunction(filesystem, 'readTextFile');
    const firstProvider = { readTextFile: vi.fn(async () => 'first') };
    const secondProvider = { readTextFile: vi.fn(async () => 'second') };

    await expect(readTextFile(firstProvider, 'same.txt')).resolves.toBe('first');
    await expect(readTextFile(secondProvider, 'same.txt')).resolves.toBe('second');
    expect(firstProvider.readTextFile).toHaveBeenCalledWith('same.txt');
    expect(secondProvider.readTextFile).toHaveBeenCalledWith('same.txt');
  });

  it('keeps the seven documented filesystem absence results in core, not on the Web provider', async () => {
    const webHostFileSystem = requiredValue<Record<string, unknown>>(hostWeb, 'webHostFileSystem');
    expect(Object.keys(webHostFileSystem).sort()).not.toEqual(
      expect.arrayContaining([
        'createFileSymlink',
        'getFilePermissions',
        'getFileRealPath',
        'getPath',
        'readFileSymlink',
        'setFilePermissions',
        'watch',
      ]),
    );
    await expect(requiredFunction(filesystem, 'createFileSymlink')('target', 'link')).resolves.toBe(false);
    await expect(requiredFunction(filesystem, 'getFilePermissions')('file')).resolves.toBe(null);
    await expect(requiredFunction(filesystem, 'getFileRealPath')('file')).resolves.toBe(null);
    expect(requiredFunction(filesystem, 'getFileSystemPath')('home')).toBe('');
    await expect(requiredFunction(filesystem, 'readFileSymlink')('link')).resolves.toBe(null);
    await expect(requiredFunction(filesystem, 'setFilePermissions')('file', {})).resolves.toBe(false);
    expect(requiredFunction(filesystem, 'watchPath')('file', vi.fn())).toBeTypeOf('function');
  });

  it('publishes Web theme color without pretending Web owns a native status bar', () => {
    const webHostStatusBarColor = requiredValue<Record<string, unknown>>(hostWeb, 'webHostStatusBarColor');
    expect(Object.keys(webHostStatusBarColor)).toEqual(['setBackgroundColor']);
    const webHost = requiredValue<{ ui: Record<string, unknown> }>(hostWeb, 'webHost');
    expect(webHost.ui.statusBarColor).toBe(webHostStatusBarColor);
    expect(webHost.ui).not.toHaveProperty('statusBarInfo');
    expect(webHost.ui).not.toHaveProperty('statusBarChange');
  });

  it('keeps style stacks isolated by explicit Host identity', () => {
    const first = fakeStatusBarProviders('light');
    const second = fakeStatusBarProviders('dark');
    const push = requiredFunction(statusbar, 'pushStatusBarStyleEntry');
    const clear = requiredFunction(statusbar, 'clearStatusBarStyleStack');

    push(first.color, first.info, first.overlays, first.style, first.visibility, { style: 'dark' });
    push(second.color, second.info, second.overlays, second.style, second.visibility, { style: 'light' });
    expect(first.setStyle).toHaveBeenLastCalledWith('dark');
    expect(second.setStyle).toHaveBeenLastCalledWith('light');

    clear(first.info);
    expect(first.setStyle).toHaveBeenLastCalledWith('light');
    expect(second.setStyle).toHaveBeenCalledTimes(1);
    clear(second.info);
    expect(second.setStyle).toHaveBeenLastCalledWith('dark');
  });

  it('contains no ambient backend resolver or mutable provider slot in either core', () => {
    for (const source of [filesystemSource, statusbarSource]) {
      expect(source).not.toMatch(/\b(?:get|set|install|observe|reset)\w*(?:Backend|HostResult)/);
      expect(source).not.toMatch(/\blet _(?:custom|host|hostConflict|hostObservation|sentinel)\b/);
    }
  });
});

function fakeStatusBarProviders(baselineStyle: 'dark' | 'light') {
  const setStyle = vi.fn();
  return {
    color: { setBackgroundColor: vi.fn() },
    info: {
      getInfo(out: Record<string, unknown>) {
        Object.assign(out, {
          color: 0,
          height: 20,
          overlaysContent: false,
          style: baselineStyle,
          visible: true,
        });
        return out;
      },
    },
    overlays: { setOverlaysContent: vi.fn() },
    setStyle,
    style: { setStyle },
    visibility: { setVisible: vi.fn() },
  };
}

function requiredFunction(module: object, name: string): (...args: any[]) => any {
  const value = Reflect.get(module, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: any[]) => any;
}

function requiredValue<T>(module: object, name: string): T {
  const value = Reflect.get(module, name);
  expect(value, `${name} export`).not.toBeUndefined();
  return value as T;
}
