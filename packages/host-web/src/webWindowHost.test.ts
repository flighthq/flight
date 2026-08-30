import type {
  HasWindowAttach,
  HasWindowCloseSubscription,
  HasWindowMoveSubscription,
  HasWindowOpen,
  HasWindowOrientationSubscription,
  HasWindowResizeSubscription,
  HasWindowVisibilitySubscription,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webWindowBackend, webWindowHost } from './index';

type WebWindowHost = HasWindowAttach &
  HasWindowCloseSubscription &
  HasWindowMoveSubscription &
  HasWindowOpen &
  HasWindowOrientationSubscription &
  HasWindowResizeSubscription &
  HasWindowVisibilitySubscription;

describe('webWindowHost', () => {
  it('is an Entity compatible with the exact Web Window capabilities', () => {
    const host: WebWindowHost = webWindowHost;

    expect(host).toBe(webWindowHost);
    expect(EntityRuntimeKey in webWindowHost).toBe(true);
    expect(webWindowHost.window).toBe(webWindowBackend);
    expect(Object.keys(webWindowHost.window).sort()).toEqual([
      'attach',
      'center',
      'close',
      'focus',
      'getBounds',
      'open',
      'setFullscreen',
      'setIcon',
      'setPosition',
      'setSize',
      'setTitle',
      'subscribeClose',
      'subscribeMove',
      'subscribeOrientation',
      'subscribeResize',
      'subscribeVisibility',
    ]);
  });

  it('is created in an isolated Window wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webWindowHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]);

    expect(relativeImports).toEqual(['./webWindow']);
    expect(source).toMatch(/export const webWindowHost = createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
