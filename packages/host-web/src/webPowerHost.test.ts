import type { HasPowerChange, HasPowerKeepAwake, HasPowerStatus, HasPowerSuspension } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webPowerCapabilities, webPowerHost } from './index';

describe('webPowerHost', () => {
  it('is an Entity compatible with the exact Web Power capabilities', () => {
    const host: HasPowerChange & HasPowerKeepAwake & HasPowerStatus & HasPowerSuspension = webPowerHost;

    expect(host).toBe(webPowerHost);
    expect(EntityRuntimeKey in webPowerHost).toBe(true);
    expect(Object.keys(webPowerHost.power).sort()).toEqual(['change', 'keepAwake', 'status', 'suspension']);
    expect(webPowerHost.power).toBe(webPowerCapabilities);
  });

  it('is created in an isolated Power wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webPowerHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]);

    expect(relativeImports).toEqual(['./webPower']);
    expect(source).toMatch(/export const webPowerHost = createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
