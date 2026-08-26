import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCapacitorNativeBuildInvocation } from '../src/nativeApplicationBuild';

const platform = process.argv[2];
if (platform !== 'android' && platform !== 'ios') {
  throw new Error('Usage: tsx scripts/buildCapacitorApp.ts <android|ios>');
}

const toolRoot = resolve(import.meta.dirname, '..');
execFileSync('npm', ['run', `build:capacitor:${platform}`], { cwd: toolRoot, stdio: 'inherit' });

const application = process.env.HOST_PROBE_CAPACITOR_APP ?? defaultApplicationPath(platform);
if (process.env.HOST_PROBE_CAPACITOR_APP === undefined) buildNativeApplication(platform);
if (!existsSync(application)) throw new Error(`Capacitor ${platform} application was not built at ${application}`);
process.stdout.write(`Capacitor ${platform} application ready: ${application}\n`);

function buildNativeApplication(target: 'android' | 'ios'): void {
  const invocation = createCapacitorNativeBuildInvocation(toolRoot, target);
  execFileSync(invocation.executable, invocation.arguments, { cwd: invocation.cwd, stdio: 'inherit' });
}

function defaultApplicationPath(target: 'android' | 'ios'): string {
  return target === 'android'
    ? resolve(toolRoot, 'android/app/build/outputs/apk/debug/app-debug.apk')
    : resolve(toolRoot, 'ios/build/Build/Products/Debug-iphonesimulator/App.app');
}
