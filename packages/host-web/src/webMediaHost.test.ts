import type { HasMediaSession, HasMediaSessionAction } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webMediaHost, webMediaSessionActionBackend, webMediaSessionBackend } from './index';

describe('webMediaHost', () => {
  it('is an Entity compatible with the exact Web Media capabilities', () => {
    const host: HasMediaSession & HasMediaSessionAction = webMediaHost;

    expect(host).toBe(webMediaHost);
    expect(EntityRuntimeKey in webMediaHost).toBe(true);
    expect(Object.keys(webMediaHost.media).sort()).toEqual(['session', 'sessionAction']);
    expect(webMediaHost.media.session).toBe(webMediaSessionBackend);
    expect(webMediaHost.media.sessionAction).toBe(webMediaSessionActionBackend);
  });

  it('is created in an isolated Media wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webMediaHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]);

    expect(relativeImports).toEqual(['./webMediasession']);
    expect(source).toMatch(/export const webMediaHost = createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
