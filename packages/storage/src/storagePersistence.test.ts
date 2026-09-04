import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HasStoragePersistenceQuery,
  HasStoragePersistenceRequest,
  StoragePersistenceQueryBackend,
  StoragePersistenceRequestBackend,
  StoragePersistenceResult,
} from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { getStoragePersistence, requestStoragePersistence } from './storagePersistence';

describe('getStoragePersistence', () => {
  it.each([
    { outcome: 'persistent', permissionState: 'denied' },
    { outcome: 'best-effort', permissionState: 'granted' },
    { outcome: 'best-effort', permissionState: null },
    { outcome: 'operation-failed', permissionState: 'prompt' },
  ] as const)('relays the independent $outcome/$permissionState snapshot exactly', async (result) => {
    const getPersistence = vi.fn(async (): Promise<StoragePersistenceResult> => result);
    const host = queryHost(
      (() => {
        const out = allocateEntity<unknown>();
        out.getPersistence = getPersistence;
        return finishEntity(out);
      })(),
    );

    await expect(getStoragePersistence(host)).resolves.toEqual(result);
    expect(getPersistence).toHaveBeenCalledOnce();
  });

  it('captures the query slot once and never crosses into request', async () => {
    const events: string[] = [];
    const query = allocateEntity<unknown>();
    query.getPersistence = async (): Promise<StoragePersistenceResult> => {
      events.push('query');
      return { outcome: 'persistent', permissionState: 'granted' };
    };
    const request = (() => {
      const out = allocateEntity<unknown>();
      out.requestPersistence = async (): Promise<StoragePersistenceResult> => {
        events.push('request');
        return { outcome: 'persistent', permissionState: 'granted' };
      };
      return finishEntity(out);
    })();
    let reads = 0;
    const storage = { persistenceRequest: request } as {
      persistenceQuery: StoragePersistenceQueryBackend;
      persistenceRequest: StoragePersistenceRequestBackend;
    };
    Object.defineProperty(storage, 'persistenceQuery', {
      get() {
        reads++;
        return query;
      },
    });

    await expect(getStoragePersistence({ storage })).resolves.toEqual({
      outcome: 'persistent',
      permissionState: 'granted',
    });
    expect(reads).toBe(1);
    expect(events).toEqual(['query']);
  });
});

describe('requestStoragePersistence', () => {
  it.each([
    { outcome: 'persistent', permissionState: 'prompt' },
    { outcome: 'best-effort', permissionState: 'denied' },
    { outcome: 'best-effort', permissionState: null },
    { outcome: 'operation-failed', permissionState: 'granted' },
  ] as const)('relays the independent $outcome/$permissionState snapshot exactly', async (result) => {
    const requestPersistence = vi.fn(async (): Promise<StoragePersistenceResult> => result);
    const host = requestHost(
      (() => {
        const out = allocateEntity<unknown>();
        out.requestPersistence = requestPersistence;
        return finishEntity(out);
      })(),
    );

    await expect(requestStoragePersistence(host)).resolves.toEqual(result);
    expect(requestPersistence).toHaveBeenCalledOnce();
  });

  it('captures the request slot once and never crosses into query', async () => {
    const events: string[] = [];
    const query = allocateEntity<unknown>();
    query.getPersistence = async (): Promise<StoragePersistenceResult> => {
      events.push('query');
      return { outcome: 'persistent', permissionState: 'granted' };
    };
    const request = (() => {
      const out = allocateEntity<unknown>();
      out.requestPersistence = async (): Promise<StoragePersistenceResult> => {
        events.push('request');
        return { outcome: 'best-effort', permissionState: null };
      };
      return finishEntity(out);
    })();
    let reads = 0;
    const storage = { persistenceQuery: query } as {
      persistenceQuery: StoragePersistenceQueryBackend;
      persistenceRequest: StoragePersistenceRequestBackend;
    };
    Object.defineProperty(storage, 'persistenceRequest', {
      get() {
        reads++;
        return request;
      },
    });

    await expect(requestStoragePersistence({ storage })).resolves.toEqual({
      outcome: 'best-effort',
      permissionState: null,
    });
    expect(reads).toBe(1);
    expect(events).toEqual(['request']);
  });
});

function queryHost(backend: StoragePersistenceQueryBackend): HasStoragePersistenceQuery {
  return { storage: { persistenceQuery: backend } };
}

function requestHost(backend: StoragePersistenceRequestBackend): HasStoragePersistenceRequest {
  return { storage: { persistenceRequest: backend } };
}
