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
    const linux = createCapacitorNativeBuildInvocation(toolRoot, 'android', 'linux');
    expect(linux.executable).toBe('./gradlew');
    expect(linux.arguments).toEqual(['assembleDebug', '--no-daemon']);
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

describe('native host CI configuration', () => {
  it('uses the Capacitor 8 iOS toolchain and allows slow Android emulator setup', () => {
    const repositoryRoot = resolve(toolRoot, '../..');
    const workflow = readFileSync(resolve(repositoryRoot, '.github/workflows/host-matrix.yml'), 'utf8');
    const webdriver = readFileSync(resolve(toolRoot, 'wdio.capacitor.conf.ts'), 'utf8');
    const endToEndTest = readFileSync(resolve(toolRoot, 'test/report.e2e.ts'), 'utf8');

    expect(workflow).toMatch(/host: capacitor-ios\s+# Capacitor 8[^\n]+\n\s+os: macos-26/);
    expect(workflow).toContain('HOST_PROBE_CAPACITOR_DEVICE_UDID=$simulator_udid');
    expect(workflow.indexOf('name: Build the Android host probe application')).toBeLessThan(
      workflow.indexOf('name: Run the Android host probe'),
    );
    expect(workflow.indexOf('name: Build the iOS host probe application')).toBeLessThan(
      workflow.indexOf('name: Select and boot an iOS simulator'),
    );
    expect(webdriver).toContain("'appium:adbExecTimeout': 120_000");
    expect(webdriver).toContain("'appium:uiautomator2ServerInstallTimeout': 120_000");
    expect(webdriver).toContain("'appium:uiautomator2ServerLaunchTimeout': 120_000");
    expect(webdriver).toContain("'appium:wdaLaunchTimeout': 300_000");
    expect(webdriver).not.toContain("'appium:autoWebview'");
    expect(webdriver).toContain('connectionRetryTimeout: 600_000');
    expect(endToEndTest).toContain("appIdentifier: 'dev.flighthq.hostprobe'");
    expect(endToEndTest).toContain("title: 'Flight Host Probe'");
  });
});
