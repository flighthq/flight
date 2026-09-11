import type {
  HasStorageChange,
  HasStorageFileSystem,
  HasStorageLocal,
  HasStoragePersistenceQuery,
  HasStoragePersistenceRequest,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { webHostFileSystem, webHostStorage, webHostStorageChange, webHostStorageGroup, webStorageHost } from './index';

type WebStorageHost = HasStorageChange &
  HasStorageFileSystem &
  HasStorageLocal &
  HasStoragePersistenceQuery &
  HasStoragePersistenceRequest;

describe('webStorageHost', () => {
  it('is an Entity compatible with the exact Web Storage capabilities', () => {
    const host: WebStorageHost = webStorageHost;

    expect(host).toBe(webStorageHost);
    expect(EntityRuntimeKey in webStorageHost).toBe(true);
    expect(Object.keys(webStorageHost.storage).sort()).toEqual([
      'change',
      'fileSystem',
      'local',
      'persistenceQuery',
      'persistenceRequest',
    ]);
    expect(webStorageHost.storage).toBe(webHostStorageGroup);
    expect(webStorageHost.storage.change).toBe(webHostStorageChange);
    expect(webStorageHost.storage.fileSystem).toBe(webHostFileSystem);
    expect(webStorageHost.storage.local).toBe(webHostStorage);
  });

  it('is created in an isolated Storage wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webStorageHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]).sort();

    expect(relativeImports).toEqual(['./webFilesystem', './webStorage', './webStoragePersistence']);
    expect(source).toMatch(/export const webStorageHost = (?:\/\* @__PURE__ \*\/ )?createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
