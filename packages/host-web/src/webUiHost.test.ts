import type { HasUiFullscreen, HasUiFullscreenSubscription, HasUiStatusBarColor } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webFullscreenBackend, webStatusBarColorBackend, webUiHost } from './index';

describe('webUiHost', () => {
  it('is an Entity compatible with the exact Web UI capabilities', () => {
    const host: HasUiFullscreen & HasUiFullscreenSubscription & HasUiStatusBarColor = webUiHost;

    expect(host).toBe(webUiHost);
    expect(EntityRuntimeKey in webUiHost).toBe(true);
    expect(Object.keys(webUiHost.ui).sort()).toEqual(['fullscreen', 'statusBarColor']);
    expect(webUiHost.ui.fullscreen).toBe(webFullscreenBackend);
    expect(webUiHost.ui.statusBarColor).toBe(webStatusBarColorBackend);
  });

  it('is created in an isolated UI wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webUiHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]).sort();

    expect(relativeImports).toEqual(['./webStatusbar', './webWindow']);
    expect(source).toMatch(/export const webUiHost = createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
