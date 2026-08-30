import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PERMISSION_NATIVE_HOLDINGS } from '../packages/permissions/src/permissionNativeHoldings';

const INITIAL_IDS = ['media', 'geolocation', 'persistence', 'midi', 'wake-lock', 'clipboard', 'push'] as const;
const INITIAL_PERMISSION_NAMES = [
  'camera',
  'microphone',
  'geolocation',
  'persistent-storage',
  'midi',
  'screen-wake-lock',
  'clipboard-read',
  'clipboard-write',
  'push',
] as const;
const INITIAL_MODES = [
  'query-and-request',
  'query-and-request',
  'query-and-request',
  'query-and-request',
  'query-and-request',
  'query-only',
  'query-only',
] as const;
const AFTER_PERSISTENCE_IDS = ['media', 'geolocation', 'midi', 'wake-lock', 'clipboard', 'push'] as const;
const AFTER_GEOLOCATION_IDS = ['media', 'midi', 'wake-lock', 'clipboard', 'push'] as const;
const AFTER_MIDI_IDS = ['media', 'wake-lock', 'clipboard', 'push'] as const;
const AFTER_MIDI_PERMISSION_NAMES = [
  'camera',
  'microphone',
  'screen-wake-lock',
  'clipboard-read',
  'clipboard-write',
  'push',
] as const;
const AFTER_MIDI_MODES = ['query-and-request', 'query-and-request', 'query-only', 'query-only'] as const;

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
  {
    reason:
      'geolocation absorbed its own mechanism: Permissions now delegates to the capability-owned ' +
      'promptForAccess through Host.system.geolocation and holds no native geolocation trigger',
    remaining: AFTER_GEOLOCATION_IDS,
  },
  {
    reason: 'MIDI query moved to Host.midi.permission; access and prompting moved to the MIDI owner',
    remaining: AFTER_MIDI_IDS,
  },
] as const;

describe('permission native holdings', () => {
  // These describe the FIRST CHECKPOINT, not the live ledger. Asserting the live rows equal the seven
  // initial ids made the gate unable to survive the first drain it exists to permit; the live set is
  // checked against the latest checkpoint by the ratchet test below.
  it('records the seven ratified holdings as the initial checkpoint', () => {
    expect(PERMISSION_NATIVE_HOLDING_HISTORY[0].remaining).toEqual(INITIAL_IDS);
    expect(INITIAL_IDS.length).toBe(7);
    expect(INITIAL_PERMISSION_NAMES.length).toBe(9);
    expect(INITIAL_MODES.length).toBe(INITIAL_IDS.length);
  });

  it('retains exactly the undrained holdings and names every future claiming domain', () => {
    expect(PERMISSION_NATIVE_HOLDINGS.map(({ id }) => id)).toEqual(AFTER_MIDI_IDS);
    expect(PERMISSION_NATIVE_HOLDINGS.map(({ futureClaimingDomain }) => futureClaimingDomain)).toEqual(AFTER_MIDI_IDS);
    expect(PERMISSION_NATIVE_HOLDINGS.flatMap(({ permissionNames }) => permissionNames)).toEqual(
      AFTER_MIDI_PERMISSION_NAMES,
    );
    expect(PERMISSION_NATIVE_HOLDINGS.map(({ mode }) => mode)).toEqual(AFTER_MIDI_MODES);
    for (const { futureClaimingDomain, id, mode, permissionNames } of PERMISSION_NATIVE_HOLDINGS) {
      expect(futureClaimingDomain, id).toBe(id);
      expect(['query-and-request', 'query-only'], id).toContain(mode);
      expect(permissionNames.length, id).toBeGreaterThan(0);
    }
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

  it('partitions every initial holding and permission name exactly once after the MIDI drain', () => {
    const remaining = PERMISSION_NATIVE_HOLDING_HISTORY.at(-1)?.remaining ?? [];
    const remainingIds = new Set<string>(remaining);
    const removed = INITIAL_IDS.filter((id) => !remainingIds.has(id));
    expect(removed).toEqual(['geolocation', 'persistence', 'midi']);
    expect(new Set([...remaining, ...removed]).size).toBe(INITIAL_IDS.length);
    expect([...remaining, ...removed].sort()).toEqual([...INITIAL_IDS].sort());

    const liveNames = PERMISSION_NATIVE_HOLDINGS.flatMap(({ permissionNames }) => permissionNames);
    const removedPermissionNames = ['geolocation', 'persistent-storage', 'midi'] as const;
    expect([...liveNames, ...removedPermissionNames].sort()).toEqual([...INITIAL_PERMISSION_NAMES].sort());
    expect(new Set([...liveNames, ...removedPermissionNames]).size).toBe(INITIAL_PERMISSION_NAMES.length);
  });

  it('rejects a history mutation that re-adds MIDI after removal', () => {
    const history = [
      ...PERMISSION_NATIVE_HOLDING_HISTORY,
      { reason: 'invalid re-addition', remaining: [...AFTER_MIDI_IDS, 'midi'] },
    ];
    expect(historyTransitionFailures(history)).toEqual(['checkpoint 4 did not shrink', 'checkpoint 4 re-added midi']);
  });

  it('rejects removing another row while its native site remains and catches a reintroduced MIDI acquisition', () => {
    const withoutMedia = PERMISSION_NATIVE_HOLDINGS.filter(({ id }) => id !== 'media');
    expect(nativeCoverageFailures(withoutMedia, productionPermissionSource())).toContain('media has live native sites');
    expect(
      nativeCoverageFailures(
        PERMISSION_NATIVE_HOLDINGS,
        `${productionPermissionSource()}\nnavigator.requestMIDIAccess()`,
      ),
    ).toContain('midi has live native sites');
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
    expect(nativeCoverageFailures(PERMISSION_NATIVE_HOLDINGS, source)).toEqual([]);

    const directNavigatorMembers = [
      ...source.matchAll(/\bnavigator\s*\.\s*([A-Za-z_$][\w$]*)/gu),
      ...source.matchAll(/\bnavigator\s+as[\s\S]{0,180}?\)\s*\.\s*([A-Za-z_$][\w$]*)/gu),
    ].map((match) => match[1]);
    // `geolocation` left this set when Permissions stopped holding a native geolocation trigger. The
    // set is exact on purpose: a re-added probe reappears here and fails, which is what makes the
    // drained row unable to come back quietly.
    expect([...new Set(directNavigatorMembers)].sort()).toEqual(['mediaDevices', 'permissions', 'wakeLock'].sort());
    expect(source).not.toMatch(/\b(?:MIDIAccess|MIDIInput|MIDIOptions|MIDIOutput|requestMIDIAccess)\b/u);
    expect(source).toMatch(/case 'midi':[\s\S]{0,120}reason: 'no-request-route'/u);
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

interface HoldingLike {
  readonly id: string;
}

interface HistoryLike {
  readonly reason: string;
  readonly remaining: readonly string[];
}

function historyTransitionFailures(history: readonly HistoryLike[]): string[] {
  const failures: string[] = [];
  for (let index = 1; index < history.length; index++) {
    const previous = new Set(history[index - 1].remaining);
    const current = history[index].remaining;
    if (current.length >= previous.size) failures.push(`checkpoint ${index} did not shrink`);
    for (const id of current) {
      if (!previous.has(id)) failures.push(`checkpoint ${index} re-added ${id}`);
    }
  }
  return failures;
}

function nativeCoverageFailures(holdings: readonly HoldingLike[], source: string): string[] {
  const nativeSites = [
    { holding: 'media', pattern: /\b(?:mediaDevices|getUserMedia)\b/u },
    { holding: 'geolocation', pattern: /navigator\s*\.\s*geolocation\b|\bgetCurrentPosition\b/u },
    {
      holding: 'persistence',
      pattern: /navigator\s*\.\s*storage\b|\bStorageManager\b|\.persist(?:ed)?\s*\(/u,
    },
    { holding: 'midi', pattern: /\brequestMIDIAccess\b/u },
    { holding: 'wake-lock', pattern: /\b(?:wakeLock|WakeLock)\b/u },
    { holding: 'clipboard', pattern: /\bclipboard(?:-read|-write)?\b/u },
    { holding: 'push', pattern: /\b(?:push|serviceWorker|pushManager)\b/u },
  ] as const;
  const active = new Set(holdings.map(({ id }) => id));
  return nativeSites
    .filter(({ holding, pattern }) => pattern.test(source) && !active.has(holding))
    .map(({ holding }) => `${holding} has live native sites`);
}
