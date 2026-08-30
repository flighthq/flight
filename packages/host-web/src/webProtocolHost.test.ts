import type { HasProtocolLaunch, HasProtocolRegistration } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webProtocolHost } from './index';

describe('webProtocolHost', () => {
  it('is an Entity compatible with the exact Web Protocol capabilities', () => {
    const host: HasProtocolLaunch & HasProtocolRegistration = webProtocolHost;

    expect(host).toBe(webProtocolHost);
    expect(EntityRuntimeKey in webProtocolHost).toBe(true);
    expect(Object.keys(webProtocolHost.protocol).sort()).toEqual(['launch', 'registration']);
  });

  it('is created in an isolated Protocol wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webProtocolHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]);

    expect(relativeImports).toEqual(['./webProtocol']);
    expect(source).toMatch(/export const webProtocolHost = createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
