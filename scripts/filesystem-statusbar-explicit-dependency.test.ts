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
    const firstHost = { storage: { fileSystem: { readTextFile: vi.fn(async () => 'first') } } };
    const secondHost = { storage: { fileSystem: { readTextFile: vi.fn(async () => 'second') } } };

    await expect(readTextFile(firstHost, 'same.txt')).resolves.toBe('first');
    await expect(readTextFile(secondHost, 'same.txt')).resolves.toBe('second');
    expect(firstHost.storage.fileSystem.readTextFile).toHaveBeenCalledWith('same.txt');
    expect(secondHost.storage.fileSystem.readTextFile).toHaveBeenCalledWith('same.txt');
  });

  it('keeps the seven documented filesystem absence results in core, not on the Web provider', async () => {
    const webFileSystemBackend = requiredValue<Record<string, unknown>>(hostWeb, 'webFileSystemBackend');
    expect(Object.keys(webFileSystemBackend).sort()).not.toEqual(
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
    const host = { storage: { fileSystem: webFileSystemBackend } };
    await expect(requiredFunction(filesystem, 'createFileSymlink')(host, 'target', 'link')).resolves.toBe(false);
    await expect(requiredFunction(filesystem, 'getFilePermissions')(host, 'file')).resolves.toBe(null);
    await expect(requiredFunction(filesystem, 'getFileRealPath')(host, 'file')).resolves.toBe(null);
    expect(requiredFunction(filesystem, 'getFileSystemPath')(host, 'home')).toBe('');
    await expect(requiredFunction(filesystem, 'readFileSymlink')(host, 'link')).resolves.toBe(null);
    await expect(requiredFunction(filesystem, 'setFilePermissions')(host, 'file', {})).resolves.toBe(false);
    expect(requiredFunction(filesystem, 'watchPath')(host, 'file', vi.fn())).toBeTypeOf('function');
  });

  it('publishes Web theme color without pretending Web owns a native status bar', () => {
    const webStatusBarColorBackend = requiredValue<Record<string, unknown>>(hostWeb, 'webStatusBarColorBackend');
    expect(Object.keys(webStatusBarColorBackend)).toEqual(['setBackgroundColor']);
    const webHost = requiredValue<{ ui: Record<string, unknown> }>(hostWeb, 'webHost');
    expect(webHost.ui.statusBarColor).toBe(webStatusBarColorBackend);
    expect(webHost.ui).not.toHaveProperty('statusBarInfo');
    expect(webHost.ui).not.toHaveProperty('statusBarChange');
  });

  it('keeps style stacks isolated by explicit Host identity', () => {
    const first = fakeStatusBarHost('light');
    const second = fakeStatusBarHost('dark');
    const push = requiredFunction(statusbar, 'pushStatusBarStyleEntry');
    const clear = requiredFunction(statusbar, 'clearStatusBarStyleStack');

    push(first.host, { style: 'dark' });
    push(second.host, { style: 'light' });
    expect(first.setStyle).toHaveBeenLastCalledWith('dark');
    expect(second.setStyle).toHaveBeenLastCalledWith('light');

    clear(first.host);
    expect(first.setStyle).toHaveBeenLastCalledWith('light');
    expect(second.setStyle).toHaveBeenCalledTimes(1);
    clear(second.host);
    expect(second.setStyle).toHaveBeenLastCalledWith('dark');
  });

  it('contains no ambient backend resolver or mutable provider slot in either core', () => {
    for (const source of [filesystemSource, statusbarSource]) {
      expect(source).not.toMatch(/\b(?:get|set|install|observe|reset)\w*(?:Backend|HostResult)/);
      expect(source).not.toMatch(/\blet _(?:custom|host|hostConflict|hostObservation|sentinel)\b/);
    }
  });
});

function fakeStatusBarHost(baselineStyle: 'dark' | 'light') {
  const setStyle = vi.fn();
  return {
    host: {
      ui: {
        statusBarColor: { setBackgroundColor: vi.fn() },
        statusBarInfo: {
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
        statusBarOverlays: { setOverlaysContent: vi.fn() },
        statusBarStyle: { setStyle },
        statusBarVisibility: { setVisible: vi.fn() },
      },
    },
    setStyle,
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
