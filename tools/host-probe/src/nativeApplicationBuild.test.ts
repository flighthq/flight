import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createCapacitorNativeBuildInvocation } from './nativeApplicationBuild';

const toolRoot = resolve(import.meta.dirname, '..');

describe('createCapacitorNativeBuildInvocation', () => {
  it('builds the Capacitor 8 Swift Package Manager project', () => {
    const invocation = createCapacitorNativeBuildInvocation(toolRoot, 'ios', 'darwin');
    expect(invocation.executable).toBe('xcodebuild');
    expect(invocation.arguments.slice(0, 2)).toEqual(['-project', 'App/App.xcodeproj']);
    expect(invocation.cwd).toBe(resolve(toolRoot, 'ios'));
  });

  it('keeps the Android Gradle wrapper platform-specific', () => {
    expect(createCapacitorNativeBuildInvocation(toolRoot, 'android', 'linux').executable).toBe('./gradlew');
    expect(createCapacitorNativeBuildInvocation(toolRoot, 'android', 'win32').executable).toBe('gradlew.bat');
  });
});

describe('Tauri packaging inputs', () => {
  it('provides every configured icon as a valid PNG', () => {
    const tauriRoot = resolve(toolRoot, 'src-tauri');
    const config = JSON.parse(readFileSync(resolve(tauriRoot, 'tauri.conf.json'), 'utf8')) as {
      bundle: { icon: string[] };
    };
    expect(config.bundle.icon.length).toBeGreaterThan(0);
    for (const icon of config.bundle.icon) {
      const path = resolve(tauriRoot, icon);
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });
});
