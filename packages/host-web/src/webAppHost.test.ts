import type {
  HasAppBadge,
  HasAppExitSubscription,
  HasAppFocus,
  HasAppLocale,
  HasAppLoop,
  HasAppName,
  HasAppQuit,
  HasAppReady,
  HasAppRelaunch,
  HasAppVisibilityQuery,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webAppHost } from './index';

type WebAppHost = HasAppBadge &
  HasAppExitSubscription &
  HasAppFocus &
  HasAppLocale &
  HasAppLoop &
  HasAppName &
  HasAppQuit &
  HasAppReady &
  HasAppRelaunch &
  HasAppVisibilityQuery;

describe('webAppHost', () => {
  it('is an Entity compatible with every truthful App capability', () => {
    const host: WebAppHost = webAppHost;

    expect(host).toBe(webAppHost);
    expect(EntityRuntimeKey in webAppHost).toBe(true);
    expect(Object.keys(webAppHost.app).sort()).toEqual([
      'badge',
      'exit',
      'focus',
      'locale',
      'loop',
      'name',
      'quit',
      'ready',
      'relaunch',
      'visibility',
    ]);
  });

  it('is created in an isolated App wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webAppHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]).sort();

    expect(relativeImports).toEqual(['./webApp', './webApplicationExit', './webLoop']);
    expect(source).toMatch(/export const webAppHost = createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
