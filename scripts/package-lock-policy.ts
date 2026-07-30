export interface PackageLockViolation {
  label: string;
  detail: string;
}

export interface WorkspaceManifest {
  path: string;
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface PackageLockEntry {
  name?: string;
  version?: string;
  resolved?: string;
  link?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface PackageLockJson {
  packages?: Record<string, PackageLockEntry>;
}

const workspaceLockKeyPattern = /^packages\/[^/]+$/;

function getWorkspaceLinkKey(packageName: string): string {
  return `node_modules/${packageName}`;
}

const dependencyFields = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'devDependencies',
] as const satisfies readonly (keyof WorkspaceManifest & keyof PackageLockEntry)[];

function getWorkspaceDependencies(manifest: WorkspaceManifest): string[] {
  return [
    ...new Set(
      dependencyFields
        .flatMap((field) => Object.keys(manifest[field] ?? {}))
        .filter((name) => name.startsWith('@flighthq/')),
    ),
  ].sort();
}

export function getPackageLockWorkspaceViolations(
  manifests: readonly WorkspaceManifest[],
  lock: PackageLockJson,
  workspaceDirectoryExists: (path: string) => boolean,
): PackageLockViolation[] {
  const violations: PackageLockViolation[] = [];
  const lockPackages = lock.packages ?? {};

  for (const manifest of [...manifests].sort((a, b) => a.path.localeCompare(b.path))) {
    const workspaceEntry = lockPackages[manifest.path];

    if (workspaceEntry === undefined) {
      violations.push({
        label: `package-lock.json has workspace entry ${manifest.path}`,
        detail: `add exactly packages[${JSON.stringify(manifest.path)}] for ${manifest.name}@${manifest.version ?? 'unknown'}; preserve unrelated lock data`,
      });
    } else {
      if (workspaceEntry.name !== manifest.name) {
        violations.push({
          label: `${manifest.path} package-lock name matches manifest`,
          detail: `set packages[${JSON.stringify(manifest.path)}].name to ${JSON.stringify(manifest.name)}; got ${JSON.stringify(workspaceEntry.name)}`,
        });
      }
      if (workspaceEntry.version !== manifest.version) {
        violations.push({
          label: `${manifest.path} package-lock version matches manifest`,
          detail: `set packages[${JSON.stringify(manifest.path)}].version to ${JSON.stringify(manifest.version)}; got ${JSON.stringify(workspaceEntry.version)}`,
        });
      }
      for (const field of dependencyFields) {
        const manifestDependencies = manifest[field] ?? {};
        const lockedDependencies = workspaceEntry[field] ?? {};
        const flightDependencies = new Set(
          [...Object.keys(manifestDependencies), ...Object.keys(lockedDependencies)].filter((name) =>
            name.startsWith('@flighthq/'),
          ),
        );
        for (const dependency of [...flightDependencies].sort()) {
          const expected = manifestDependencies[dependency];
          const actual = lockedDependencies[dependency];
          if (actual === expected) continue;
          const fieldPath = `packages[${JSON.stringify(manifest.path)}].${field}[${JSON.stringify(dependency)}]`;
          violations.push({
            label: `${manifest.path} ${field} entry for ${dependency} matches manifest`,
            detail:
              expected === undefined
                ? `remove exactly ${fieldPath}; the manifest no longer declares it`
                : `set exactly ${fieldPath} to ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`,
          });
        }
      }
    }

    const linkKey = getWorkspaceLinkKey(manifest.name);
    const linkEntry = lockPackages[linkKey];
    if (linkEntry?.link !== true || linkEntry.resolved !== manifest.path) {
      violations.push({
        label: `package-lock.json has workspace link ${linkKey}`,
        detail: `set exactly packages[${JSON.stringify(linkKey)}] to ${JSON.stringify({ resolved: manifest.path, link: true })}; got ${JSON.stringify(linkEntry)}`,
      });
    }

    for (const dependency of getWorkspaceDependencies(manifest)) {
      const dependencyLinkKey = getWorkspaceLinkKey(dependency);
      if (lockPackages[dependencyLinkKey]?.link === true) continue;
      violations.push({
        label: `${manifest.path} dependency ${dependency} has a workspace link`,
        detail: `add exactly packages[${JSON.stringify(dependencyLinkKey)}] with link true; declared by ${manifest.path}/package.json`,
      });
    }
  }

  for (const lockKey of Object.keys(lockPackages)
    .filter((key) => workspaceLockKeyPattern.test(key))
    .sort()) {
    if (workspaceDirectoryExists(lockKey)) continue;
    violations.push({
      label: `package-lock.json workspace entry ${lockKey} maps to an existing directory`,
      detail: `remove exactly packages[${JSON.stringify(lockKey)}]; ${lockKey} does not exist`,
    });
  }

  return violations;
}
