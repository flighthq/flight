import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('permission host ownership', () => {
  it('leaves no browser-native holding in the permissions capability package', () => {
    const source = productionPermissionSource();
    expect(source).not.toMatch(/\bnavigator\b/u);
    expect(source).not.toMatch(/\bNotification\s*\./u);
    expect(source).not.toMatch(/\btypeof\s+Notification\b/u);
    expect(source).not.toMatch(/\b(?:MediaDevices|MediaStream|MediaStreamTrack|Permissions|WakeLock)\b/u);
  });

  it('defines the exact narrow provider and publishes it through the system Host group', () => {
    const permissionTypes = readFileSync(resolve('packages/types/src/Permission.ts'), 'utf8');
    expect(permissionTypes).toMatch(/export interface HostPermissionsCapability \{/u);
    expect(permissionTypes).toContain('readonly notification: HostNotificationPermissionCapability;');
    expect(permissionTypes).toContain('queryPermission(name: PermissionName): Promise<PermissionQueryOutcome>;');
    expect(permissionTypes).toContain(
      "requestMediaAccess(name: 'camera' | 'microphone'): Promise<PermissionRequestOutcome>;",
    );
    expect(permissionTypes).toContain('requestWakeLock(): Promise<PermissionRequestOutcome>;');

    const hostTypes = readFileSync(resolve('packages/types/src/Host.ts'), 'utf8');
    expect(hostTypes).toMatch(/readonly permissions: HostPermissionsCapabilities;/u);
  });

  it('moves every Web permission operation behind the webHostPermissions singleton', () => {
    const source = readFileSync(resolve('packages/host-web/src/webPermissions.ts'), 'utf8');
    // The factory is deliberately unexported — the const singleton is the API, per the entity boundary
    // rule for dispatch infrastructure. What this gate pins is that the browser permission calls sit
    // behind it in this one file, which is true whether or not the factory itself is exported.
    expect(source).toMatch(/function createWebPermissionsBackend/u);
    expect(source).toMatch(/export const webHostPermissions = createWebPermissionsBackend\(\);/u);
    expect(source).toMatch(/navigator\.permissions/u);
    expect(source).toMatch(/navigator\.mediaDevices/u);
    expect(source).toMatch(/navigator\.wakeLock/u);
    expect(source).toMatch(/typeof Notification === 'undefined'/u);
    expect(source).toMatch(/Notification\.permission/u);
    expect(source).toMatch(/Notification\.requestPermission\(\)/u);
  });

  it('makes the page Notification profile consume the provider instead of a second native owner', () => {
    const source = readFileSync(resolve('packages/host-web/src/webNotification.ts'), 'utf8');
    expect(source).toContain('hostNotificationPermission: Readonly<HostNotificationPermissionCapability>');
    expect(source).toContain('permission: hostNotificationPermission,');
    expect(source).not.toMatch(/api\.Notification\.permission/u);
    expect(source).not.toMatch(/api\.Notification\.requestPermission/u);
  });

  it('retires the native-holdings ledger and its exported type', () => {
    expect(existsSync(resolve('packages/permissions/src/permissionNativeHoldings.ts'))).toBe(false);
    expect(existsSync(resolve('packages/types/src/PermissionNativeHolding.ts'))).toBe(false);
    expect(readFileSync(resolve('packages/types/src/contract.ts'), 'utf8')).not.toContain('PermissionNativeHolding');
    expect(productionPermissionSource()).not.toContain('PERMISSION_NATIVE_HOLDINGS');
  });

  it('does not reintroduce ambient resolution, mutation, or an enabler era', () => {
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
    expect(productionHostWebSource()).not.toContain('enableHostWebPermission');
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
