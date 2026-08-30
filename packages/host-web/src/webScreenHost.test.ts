import type {
  HasScreenChange,
  HasScreenDetails,
  HasScreenPermissionChange,
  HasScreenQuery,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webScreenCapabilities, webScreenHost } from './index';

describe('webScreenHost', () => {
  it('is an Entity compatible with the exact Web Screen capabilities', () => {
    const host: HasScreenChange & HasScreenDetails & HasScreenPermissionChange & HasScreenQuery = webScreenHost;

    expect(host).toBe(webScreenHost);
    expect(EntityRuntimeKey in webScreenHost).toBe(true);
    expect(Object.keys(webScreenHost.screen).sort()).toEqual(['change', 'details', 'permissionChange', 'query']);
    expect(webScreenHost.screen).toBe(webScreenCapabilities);
  });

  it('is created in an isolated Screen wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webScreenHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]);

    expect(relativeImports).toEqual(['./webScreen']);
    expect(source).toMatch(/export const webScreenHost = createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
