import type {
  HasSystemDevice,
  HasSystemLifecycle,
  HasSystemPlatform,
  HasSystemSensors,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webDeviceBackend, webLifecycleBackend, webPlatformBackend, webSensorsBackend, webSystemHost } from './index';

describe('webSystemHost', () => {
  it('is an Entity compatible with the exact Web System capabilities', () => {
    const host: HasSystemDevice & HasSystemLifecycle & HasSystemPlatform & HasSystemSensors = webSystemHost;

    expect(host).toBe(webSystemHost);
    expect(EntityRuntimeKey in webSystemHost).toBe(true);
    expect(Object.keys(webSystemHost.system).sort()).toEqual(['device', 'lifecycle', 'platform', 'sensors']);
    expect(webSystemHost.system.device).toBe(webDeviceBackend);
    expect(webSystemHost.system.lifecycle).toBe(webLifecycleBackend);
    expect(webSystemHost.system.platform).toBe(webPlatformBackend);
    expect(webSystemHost.system.sensors).toBe(webSensorsBackend);
  });

  it('is created in an isolated System wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webSystemHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]).sort();

    expect(relativeImports).toEqual(['./webDevice', './webLifecycle', './webPlatform', './webSensors']);
    expect(source).toMatch(/export const webSystemHost = createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
