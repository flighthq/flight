import { resolve } from 'node:path';

const platform = process.env.HOST_PROBE_CAPACITOR_PLATFORM;
if (platform !== 'android' && platform !== 'ios') {
  throw new Error('HOST_PROBE_CAPACITOR_PLATFORM must be android or ios');
}

const application =
  process.env.HOST_PROBE_CAPACITOR_APP ??
  (platform === 'android'
    ? resolve(import.meta.dirname, 'android/app/build/outputs/apk/debug/app-debug.apk')
    : resolve(import.meta.dirname, 'ios/build/Build/Products/Debug-iphonesimulator/App.app'));
const platformVersion = process.env.HOST_PROBE_CAPACITOR_PLATFORM_VERSION;

const capability =
  platform === 'android'
    ? {
        platformName: 'Android',
        'appium:app': application,
        'appium:autoWebview': true,
        'appium:automationName': 'UiAutomator2',
        'appium:chromedriverAutodownload': true,
        'appium:deviceName': process.env.HOST_PROBE_CAPACITOR_DEVICE ?? 'Android Emulator',
        'appium:ensureWebviewsHavePages': true,
        ...(platformVersion === undefined ? {} : { 'appium:platformVersion': platformVersion }),
      }
    : {
        platformName: 'iOS',
        'appium:app': application,
        'appium:autoWebview': true,
        'appium:automationName': 'XCUITest',
        'appium:deviceName': process.env.HOST_PROBE_CAPACITOR_DEVICE ?? 'iPhone 16',
        ...(platformVersion === undefined ? {} : { 'appium:platformVersion': platformVersion }),
      };

export const config: WebdriverIO.Config = {
  capabilities: [capability],
  framework: 'mocha',
  logLevel: 'warn',
  maxInstances: 1,
  mochaOpts: { timeout: 120_000 },
  reporters: ['spec'],
  runner: 'local',
  services: [['appium', { args: { relaxedSecurity: true } }]],
  specs: [resolve(import.meta.dirname, 'test/report.e2e.ts')],
};
