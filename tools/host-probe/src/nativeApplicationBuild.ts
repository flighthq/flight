import { resolve } from 'node:path';

export function createCapacitorNativeBuildInvocation(
  toolRoot: string,
  target: 'android' | 'ios',
  operatingSystem: NodeJS.Platform = process.platform,
) {
  if (target === 'android') {
    return {
      arguments: ['assembleDebug'],
      cwd: resolve(toolRoot, 'android'),
      executable: operatingSystem === 'win32' ? 'gradlew.bat' : './gradlew',
    };
  }
  if (operatingSystem !== 'darwin') throw new Error('The Capacitor iOS lane requires macOS and Xcode');
  return {
    arguments: [
      '-project',
      'App/App.xcodeproj',
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
    cwd: resolve(toolRoot, 'ios'),
    executable: 'xcodebuild',
  };
}
