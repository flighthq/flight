import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  Entity,
  StorageBackend,
  StorageClearFailureReason,
  StorageGetItemFailureReason,
  StorageRemoveItemFailureReason,
  StorageSetItemFailureReason,
} from '@flighthq/types/contract';

type StorageRecord = Record<string, string>;
type StorageRecordResult =
  | { readonly reason: 'ok'; readonly value: StorageRecord }
  | { readonly reason: StorageGetItemFailureReason; readonly value: null };

// Maps synchronous Storage commands to one JSON file in Electron's userData directory. Mutations build
// a candidate record, write it to a temporary file in the SAME directory, atomically rename it over the
// target, and only then commit the in-memory cache. `reason: 'ok'` therefore means atomic visibility,
// not fsync or power-loss durability; the public StorageMutationResult contract states that distinction.
export function createElectronStorageBackend(
  electron: ElectronApi,
  fileName = 'storage.json',
): StorageBackend & Entity {
  const fs = electron.fs;
  let cache: StorageRecord | null = null;
  let temporaryId = 0;

  const load = (): StorageRecordResult => {
    if (cache !== null) return { reason: 'ok', value: cache };
    let path: string;
    try {
      path = storagePath();
      if (!fs.existsSync(path)) {
        cache = {};
        return { reason: 'ok', value: cache };
      }
      const raw = fs.readFileSync(path, 'utf-8');
      const parsed = parseStorageRecord(raw);
      if (parsed === null) return { reason: 'persistence-invalid', value: null };
      cache = parsed;
      return { reason: 'ok', value: cache };
    } catch (error) {
      return { reason: classifyReadFailure(error), value: null };
    }
  };

  const persist = <
    FailureReason extends StorageClearFailureReason | StorageRemoveItemFailureReason | StorageSetItemFailureReason,
  >(
    candidate: Readonly<StorageRecord>,
    fallback: FailureReason,
  ): { readonly reason: 'ok' | FailureReason | 'security-denied' | 'quota-exceeded' } => {
    let temporaryPath: string | null = null;
    try {
      const path = storagePath();
      temporaryPath = `${path}.tmp-${++temporaryId}`;
      fs.writeFileSync(temporaryPath, JSON.stringify(candidate));
      fs.renameSync(temporaryPath, path);
      return { reason: 'ok' };
    } catch (error) {
      if (temporaryPath !== null) {
        try {
          fs.unlinkSync(temporaryPath);
        } catch {
          // Cleanup is best-effort and never changes the method-tight failure reported to the caller.
        }
      }
      return { reason: classifyMutationFailure(error, fallback) };
    }
  };

  const storagePath = (): string => `${electron.app.getPath('userData')}/${fileName}`;

  const out = allocateEntity<StorageBackend>();
  out.clear = () => {
    const candidate: StorageRecord = {};
    const result = persist(candidate, 'clear-failed');
    if (result.reason === 'ok') cache = candidate;
    return result;
  };
  out.getItem = (key) => {
    const loaded = load();
    if (loaded.reason !== 'ok') return loaded;
    return {
      reason: 'ok',
      value: Object.prototype.hasOwnProperty.call(loaded.value, key) ? loaded.value[key] : null,
    };
  };
  out.keys = () => {
    const loaded = load();
    if (loaded.reason !== 'ok') return loaded;
    return { reason: 'ok', value: Object.keys(loaded.value) };
  };
  out.removeItem = (key) => {
    const loaded = load();
    if (loaded.reason !== 'ok') return { reason: loaded.reason };
    if (!Object.prototype.hasOwnProperty.call(loaded.value, key)) return { reason: 'ok' };
    const candidate = { ...loaded.value };
    delete candidate[key];
    const result = persist(candidate, 'remove-failed');
    if (result.reason === 'ok') cache = candidate;
    return result;
  };
  out.setItem = (key, value) => {
    const loaded = load();
    if (loaded.reason !== 'ok') return { reason: loaded.reason };
    const candidate = { ...loaded.value, [key]: value };
    const result = persist(candidate, 'write-failed');
    if (result.reason === 'ok') cache = candidate;
    return result;
  };
  return finishEntity(out);
}

function classifyMutationFailure<FailureReason extends string>(
  error: unknown,
  fallback: FailureReason,
): FailureReason | 'security-denied' | 'quota-exceeded' {
  const code = getErrorCode(error);
  if (code === 'EACCES' || code === 'EPERM') return 'security-denied';
  if (code === 'EDQUOT' || code === 'ENOSPC') return 'quota-exceeded';
  return fallback;
}

function classifyReadFailure(error: unknown): StorageGetItemFailureReason {
  const code = getErrorCode(error);
  return code === 'EACCES' || code === 'EPERM' ? 'security-denied' : 'read-failed';
}

function getErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function parseStorageRecord(raw: string): StorageRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed);
  if (entries.some(([, value]) => typeof value !== 'string')) return null;
  return Object.fromEntries(entries) as StorageRecord;
}
