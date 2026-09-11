import type {
  HasSystemDevice,
  HasSystemGeolocation,
  HasSystemLifecycle,
  HasSystemPlatform,
  HasSystemSensors,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webHostDevice, webHostGeolocation, webHostPlatform, webHostSystem, webSystemHost } from './index';
import { webHostLifecycle } from './webLifecycle';
import { webHostSensors } from './webSensors';

describe('webSystemHost', () => {
  it('is an Entity compatible with the exact Web System capabilities', () => {
    const host: HasSystemDevice & HasSystemGeolocation & HasSystemLifecycle & HasSystemPlatform & HasSystemSensors =
      webSystemHost;

    expect(host).toBe(webSystemHost);
    expect(EntityRuntimeKey in webSystemHost).toBe(true);
    expect(webSystemHost.system).toBe(webHostSystem);
    expect(Object.keys(webSystemHost.system).sort()).toEqual([
      'device',
      'geolocation',
      'lifecycle',
      'platform',
      'sensors',
    ]);
    expect(webSystemHost.system.device).toBe(webHostDevice);
    expect(webSystemHost.system.geolocation).toBe(webHostGeolocation);
    expect(webSystemHost.system.lifecycle).toBe(webHostLifecycle);
    expect(webSystemHost.system.platform).toBe(webHostPlatform);
    expect(webSystemHost.system.sensors).toBe(webHostSensors);
  });

  it('is created in an isolated System wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webSystemHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]).sort();

    expect(relativeImports).toEqual([
      './webDevice',
      './webGeolocation',
      './webLifecycle',
      './webPlatform',
      './webSensors',
    ]);
    expect(source).toMatch(/export const webSystemHost = (?:\/\* @__PURE__ \*\/ )?createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
