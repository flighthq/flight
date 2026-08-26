import { resolve } from 'node:path';

import type { WdioTauriConfig } from '@wdio/native-types';

const executable = process.platform === 'win32' ? 'flight-host-probe.exe' : 'flight-host-probe';

export const config: WdioTauriConfig = {
  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': {
        application: resolve(import.meta.dirname, 'src-tauri/target/release', executable),
      },
    },
  ],
  framework: 'mocha',
  logLevel: 'warn',
  maxInstances: 1,
  mochaOpts: { timeout: 60_000 },
  reporters: ['spec'],
  runner: 'local',
  services: [['@wdio/tauri-service', { driverProvider: 'embedded' }]],
  specs: [resolve(import.meta.dirname, 'test/report.e2e.ts')],
};
