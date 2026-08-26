import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
  if (target === 'android') {
    const executable = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    execFileSync(executable, ['assembleDebug'], { cwd: resolve(toolRoot, 'android'), stdio: 'inherit' });
    return;
  }
  if (process.platform !== 'darwin') throw new Error('The Capacitor iOS lane requires macOS and Xcode');
  execFileSync(
    'xcodebuild',
    [
      '-workspace',
      'App/App.xcworkspace',
      '-scheme',
      'App',
      '-configuration',
      'Debug',
      '-sdk',
      'iphonesimulator',
      '-derivedDataPath',
      'build',
      'CODE_SIGNING_ALLOWED=NO',
    ],
    { cwd: resolve(toolRoot, 'ios'), stdio: 'inherit' },
  );
}

function defaultApplicationPath(target: 'android' | 'ios'): string {
  return target === 'android'
    ? resolve(toolRoot, 'android/app/build/outputs/apk/debug/app-debug.apk')
    : resolve(toolRoot, 'ios/build/Build/Products/Debug-iphonesimulator/App.app');
}
