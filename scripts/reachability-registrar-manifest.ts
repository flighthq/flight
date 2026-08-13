import type { RegistrarOwnershipEntry } from './reachability-core';

export interface RegistrarIdentity {
  packageName: string;
  registrar: string;
}

export interface RegistrarIdentityManifest {
  schemaVersion: 1;
  registrars: RegistrarIdentity[];
}

export interface RegistrarIdentityManifestDiff {
  added: RegistrarIdentity[];
  lost: RegistrarIdentity[];
}

// This deliberately mirrors the planned capture baseline coverage manifest mechanism: an exact committed
// identity set, an explicit diff, and a separate acceptance path. The two manifests stay separate because
// capture targets and exported registrar declarations are different populations with different discovery
// and review lifecycles; coupling them would make either census able to erode the other one's contract.
export function collectRegistrarIdentities(
  ownership: readonly Pick<RegistrarOwnershipEntry, 'packageName' | 'registrar'>[],
): RegistrarIdentity[] {
  const identities = new Map<string, RegistrarIdentity>();
  for (const entry of ownership) {
    identities.set(registrarIdentityKey(entry), { packageName: entry.packageName, registrar: entry.registrar });
  }
  return [...identities.values()].sort(compareRegistrarIdentity);
}

export function diffRegistrarIdentityManifest(
  expected: readonly RegistrarIdentity[],
  current: readonly RegistrarIdentity[],
): RegistrarIdentityManifestDiff {
  const expectedByKey = new Map(expected.map((identity) => [registrarIdentityKey(identity), identity]));
  const currentByKey = new Map(current.map((identity) => [registrarIdentityKey(identity), identity]));
  return {
    added: current
      .filter((identity) => !expectedByKey.has(registrarIdentityKey(identity)))
      .sort(compareRegistrarIdentity),
    lost: expected
      .filter((identity) => !currentByKey.has(registrarIdentityKey(identity)))
      .sort(compareRegistrarIdentity),
  };
}

export function hasRegistrarIdentityManifestDrift(diff: Readonly<RegistrarIdentityManifestDiff>): boolean {
  return diff.added.length > 0 || diff.lost.length > 0;
}

export function registrarIdentityKey(identity: Readonly<RegistrarIdentity>): string {
  return `${identity.packageName}\0${identity.registrar}`;
}

function compareRegistrarIdentity(a: Readonly<RegistrarIdentity>, b: Readonly<RegistrarIdentity>): number {
  return a.packageName.localeCompare(b.packageName) || a.registrar.localeCompare(b.registrar);
}
