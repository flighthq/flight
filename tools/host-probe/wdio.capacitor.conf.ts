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
const deviceUdid = process.env.HOST_PROBE_CAPACITOR_DEVICE_UDID;
const artifactDirectory = process.env.HOST_PROBE_ARTIFACT_DIR;

const capability =
  platform === 'android'
    ? {
        platformName: 'Android',
        // GitHub's nested-virtualization runners can take substantially longer than Appium's 20-second
        // defaults to install the UiAutomator2 server or complete package-manager commands.
        'appium:adbExecTimeout': 120_000,
        'appium:app': application,
        'appium:automationName': 'UiAutomator2',
        'appium:chromedriverAutodownload': true,
        'appium:clearDeviceLogsOnStart': true,
        'appium:deviceName': process.env.HOST_PROBE_CAPACITOR_DEVICE ?? 'Android Emulator',
        'appium:ensureWebviewsHavePages': true,
        'appium:skipUnlock': true,
        'appium:uiautomator2ServerInstallTimeout': 120_000,
        'appium:uiautomator2ServerLaunchTimeout': 120_000,
        ...(platformVersion === undefined ? {} : { 'appium:platformVersion': platformVersion }),
        ...(deviceUdid === undefined ? {} : { 'appium:udid': deviceUdid }),
      }
    : {
        platformName: 'iOS',
        'appium:additionalWebviewBundleIds': ['*'],
        'appium:app': application,
        'appium:automationName': 'XCUITest',
        'appium:deviceName': process.env.HOST_PROBE_CAPACITOR_DEVICE ?? 'iPhone 16',
        'appium:simulatorStartupTimeout': 300_000,
        'appium:wdaLaunchTimeout': 300_000,
        'appium:webviewConnectRetries': 120,
        'appium:webviewConnectTimeout': 30_000,
        ...(platformVersion === undefined ? {} : { 'appium:platformVersion': platformVersion }),
        ...(deviceUdid === undefined ? {} : { 'appium:udid': deviceUdid }),
      };

export const config: WebdriverIO.Config = {
  capabilities: [capability],
  framework: 'mocha',
  logLevel: 'warn',
  maxInstances: 1,
  mochaOpts: { timeout: 300_000 },
  reporters: ['spec'],
  runner: 'local',
  connectionRetryTimeout: 600_000,
  services: [
    [
      'appium',
      {
        args: { logLevel: 'debug', relaxedSecurity: true },
        ...(artifactDirectory === undefined ? {} : { logPath: artifactDirectory }),
      },
    ],
  ],
  specs: [resolve(import.meta.dirname, 'test/report.e2e.ts')],
};
