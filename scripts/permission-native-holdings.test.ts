import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PERMISSION_NATIVE_HOLDINGS } from '../packages/permissions/src/permissionNativeHoldings';

const INITIAL_IDS = ['media', 'geolocation', 'persistence', 'midi', 'wake-lock', 'clipboard', 'push'] as const;
const AFTER_PERSISTENCE_IDS = ['media', 'geolocation', 'midi', 'wake-lock', 'clipboard', 'push'] as const;
const AFTER_PERSISTENCE_PERMISSION_NAMES = [
  'camera',
  'microphone',
  'geolocation',
  'midi',
  'screen-wake-lock',
  'clipboard-read',
  'clipboard-write',
  'push',
] as const;
const AFTER_PERSISTENCE_MODES = [
  'query-and-request',
  'query-and-request',
  'query-and-request',
  'query-and-request',
  'query-only',
  'query-only',
] as const;

// APPEND ONLY. A new checkpoint may remove ids from the preceding checkpoint; it may never add one.
const PERMISSION_NATIVE_HOLDING_HISTORY = [
  {
    reason: 'ratified initial interim holdings; Notification is exclusively Host.notification.permission',
    remaining: INITIAL_IDS,
  },
  {
    reason: 'persistent bucket policy is exclusively Host.storage persistence query/request',
    remaining: AFTER_PERSISTENCE_IDS,
  },
] as const;

describe('permission native holdings', () => {
  it('retains exactly the undrained holdings and names every future claiming domain', () => {
    expect(PERMISSION_NATIVE_HOLDINGS.map(({ id }) => id)).toEqual(AFTER_PERSISTENCE_IDS);
    expect(PERMISSION_NATIVE_HOLDINGS.map(({ futureClaimingDomain }) => futureClaimingDomain)).toEqual(
      AFTER_PERSISTENCE_IDS,
    );
    expect(PERMISSION_NATIVE_HOLDINGS.flatMap(({ permissionNames }) => permissionNames)).toEqual(
      AFTER_PERSISTENCE_PERMISSION_NAMES,
    );
    expect(PERMISSION_NATIVE_HOLDINGS.map(({ mode }) => mode)).toEqual(AFTER_PERSISTENCE_MODES);
  });

  it('drains row-by-row and can never grow without a new ratified history shape', () => {
    for (let index = 1; index < PERMISSION_NATIVE_HOLDING_HISTORY.length; index++) {
      const previous = new Set<string>(PERMISSION_NATIVE_HOLDING_HISTORY[index - 1].remaining);
      const current = PERMISSION_NATIVE_HOLDING_HISTORY[index].remaining;
      expect(current.length).toBeLessThan(previous.size);
      expect(current.every((id) => previous.has(id))).toBe(true);
    }
    expect(PERMISSION_NATIVE_HOLDINGS.map(({ id }) => id)).toEqual(PERMISSION_NATIVE_HOLDING_HISTORY.at(-1)?.remaining);
  });

  it('has no second native Notification permission owner anywhere in Permissions', () => {
    const source = productionPermissionSource();
    expect(source).not.toMatch(/\bNotification\s*\./u);
    expect(source).not.toMatch(/\btypeof\s+Notification\b/u);
    expect(source).not.toContain('getWebNotification');
    expect(source).not.toMatch(/\b(?:checkPermissions|requestPermissions|isPermissionGranted)\b/u);
  });

  it('makes every interim native trigger visible through a live holding row', () => {
    const source = productionPermissionSource();
    const nativeSites = [
      { holding: 'media', pattern: /\b(?:mediaDevices|getUserMedia)\b/u },
      { holding: 'geolocation', pattern: /\b(?:geolocation|getCurrentPosition)\b/u },
      { holding: 'midi', pattern: /\b(?:requestMIDIAccess|MidiPermission)\b/u },
      { holding: 'wake-lock', pattern: /\b(?:wakeLock|WakeLock)\b/u },
      { holding: 'clipboard', pattern: /\bclipboard(?:-read|-write)?\b/u },
      { holding: 'push', pattern: /\b(?:push|serviceWorker|pushManager)\b/u },
    ] as const;
    const activeHoldings = new Set(PERMISSION_NATIVE_HOLDINGS.map(({ id }) => id));

    for (const { holding, pattern } of nativeSites) {
      if (pattern.test(source)) expect(activeHoldings, holding).toContain(holding);
    }

    const directNavigatorMembers = [
      ...source.matchAll(/\bnavigator\s*\.\s*([A-Za-z_$][\w$]*)/gu),
      ...source.matchAll(/\bnavigator\s+as[\s\S]{0,180}?\)\s*\.\s*([A-Za-z_$][\w$]*)/gu),
    ].map((match) => match[1]);
    expect([...new Set(directNavigatorMembers)].sort()).toEqual(
      ['geolocation', 'mediaDevices', 'permissions', 'requestMIDIAccess', 'wakeLock'].sort(),
    );
  });

  it('has no direct persistent-storage native owner and carries the exact projection arm twice', () => {
    const source = productionPermissionSource();
    expect(source).not.toMatch(/\bnavigator\s*\.\s*storage\b/u);
    expect(source).not.toMatch(/\bStorageManager\b/u);
    expect(source).not.toMatch(/\.persist(?:ed)?\s*\(/u);

    const permissionTypes = readFileSync(resolve('packages/types/src/Permission.ts'), 'utf8');
    const exactArm =
      "// This arm records storage policy state, not a human decision.\n  | { readonly reason: 'best-effort'; readonly state: PermissionState | null }";
    expect(permissionTypes.split(exactArm)).toHaveLength(3);
  });

  it('deletes every ambient backend and host-enabler mechanism rather than leaving a parallel era', () => {
    const source = `${productionPermissionSource()}\n${productionPermissionTypeSource()}`;
    for (const symbol of [
      'HasSystemPermissions',
      'PermissionBackend',
      'PermissionOwnerMap',
      'PermissionSlotMap',
      'enablePermissionSignals',
      'getPermissionBackend',
      'onPermissionChange',
      'permissionOwners',
      'permissionSlots',
      'setPermissionBackend',
      'subscribePermission',
      'installPermissionHostBackend',
      'observePermissionHostResult',
      'resetPermissionBackendForTest',
      'explainPermissionBackend',
    ]) {
      expect(source, symbol).not.toMatch(new RegExp(`\\b${symbol}\\b`, 'u'));
    }
    expect(source).not.toMatch(/\bsystem\s*\.\s*permissions\b/u);

    const hostWebSource = productionHostWebSource();
    expect(hostWebSource).not.toContain('enableHostWebPermission');
    expect(hostWebSource).not.toContain('resetHostWebPermissionsForTest');
  });
});

function productionHostWebSource(): string {
  return readProductionSources(resolve('packages/host-web/src'));
}

function productionPermissionSource(): string {
  return readProductionSources(resolve('packages/permissions/src'));
}

function productionPermissionTypeSource(): string {
  return ['Host.ts', 'Permission.ts']
    .map((file) => readFileSync(resolve('packages/types/src', file), 'utf8'))
    .join('\n');
}

function readProductionSources(directory: string): string {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .sort()
    .map((file) => readFileSync(join(directory, file), 'utf8'))
    .join('\n');
}
