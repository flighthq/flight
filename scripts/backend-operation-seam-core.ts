import { readFileSync } from 'node:fs';

import { formatGateProvenance, GATE_STRUCTURAL_LIMIT, readGateTreeState } from './gate-provenance';
import { getParsedOxcSource } from './oxc-source';

// The per-operation availability ratchet.
//
// It enforces the seam only on interfaces that HAVE been migrated, and reports how many have not — so it
// starts green and tightens as each slice lands, rather than starting red on every known violation, which
// is a broken build wearing a gate's name.
//
// ★ MEMBERSHIP IS DERIVED FROM THE SAME STRUCTURAL PREDICATE AS THE SEAM ITSELF, never a list:
//
//   an interface is MIGRATED iff its owning package exports `explain<Name>Operation`, OR a derived
//   explicit Host slot has a direct consumer for every non-lifecycle method in the interface.
//
// A package therefore joins the enforced set BY BEING MIGRATED. There is no roster to update, so the
// enforced set cannot drift from the code the way a hand-maintained one does, and nobody can quiet the
// gate by editing a list instead of the seam.

export interface BackendOperationSeamEntry {
  // `FileOpenDialog` for `FileOpenDialogBackend` — the token every derived name is built from.
  name: string;
  // True when either the legacy explain/has seam or an equal-coverage explicit Host shape is present.
  migrated: boolean;
  packageName: string | null;
}

export interface BackendOperationSeamViolation {
  detail: string;
  name: string;
  rule: 'missing-has' | 'sentinel-counted-as-support' | 'unowned-migrated-seam';
}

export interface BackendOperationSeamReport {
  enforced: number;
  entries: readonly BackendOperationSeamEntry[];
  notMigrated: number;
  total: number;
  violations: readonly BackendOperationSeamViolation[];
}

// The empty report, owned beside the type it builds. See `createEmptyBackendLifecycleReport` for why
// every report type carries one: a fixture that needs a valid report rather than a particular one
// starts here, so a new field is supplied once instead of at each construction site.
export function createEmptyBackendOperationSeamReport(): BackendOperationSeamReport {
  return { enforced: 0, entries: [], notMigrated: 0, total: 0, violations: [] };
}

// Every `*Backend` interface declared in `@flighthq/types`. This is the denominator, and it is derived
// rather than counted once and written down.
export function collectBackendInterfaceNames(typeSourceFiles: readonly string[]): string[] {
  const names = new Set<string>();
  for (const sourceFile of typeSourceFiles) {
    for (const statement of getParsedOxcSource(sourceFile).program.body) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      const declaration = statement.declaration;
      if (declaration === null || declaration.type !== 'TSInterfaceDeclaration') continue;
      if (!declaration.id.name.endsWith('Backend')) continue;
      names.add(declaration.id.name.slice(0, -'Backend'.length));
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

// Derives explicit Host completion without a capability roster. A simple `Has*` trait gives us the
// backend-to-slot relationship; the backend declaration gives us its operation population; production
// source must name that trait and directly call every non-lifecycle operation through the exact slot.
// `destroy`/`dispose` are deliberately excluded here because their ownership is enforced by the separate
// backend-lifecycle census.
export function collectExplicitHostOperationSeams(
  typeSourceFiles: readonly string[],
  productionSourceFiles: readonly string[],
): ReadonlyMap<string, string> {
  const methodsByBackend = new Map<string, Set<string>>();
  let hostSource = '';
  for (const sourceFile of typeSourceFiles) {
    const source = readFileSync(sourceFile, 'utf-8');
    if (sourceFile.endsWith('/Host.ts') || sourceFile.endsWith('\\Host.ts')) hostSource = source;
    for (const statement of getParsedOxcSource(sourceFile).program.body) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      const declaration = statement.declaration;
      if (declaration === null || declaration.type !== 'TSInterfaceDeclaration') continue;
      if (!declaration.id.name.endsWith('Backend')) continue;
      const methods = new Set<string>();
      for (const member of declaration.body.body) {
        if (
          (member.type !== 'TSMethodSignature' && member.type !== 'TSPropertySignature') ||
          member.key.type !== 'Identifier'
        ) {
          continue;
        }
        const method = member.key.name;
        if (method === 'destroy' || method === 'dispose') continue;
        if (member.type === 'TSMethodSignature' || member.typeAnnotation?.typeAnnotation.type === 'TSFunctionType') {
          methods.add(method);
        }
      }
      if (methods.size > 0) methodsByBackend.set(declaration.id.name, methods);
    }
  }

  const production = productionSourceFiles.map((sourceFile) => readFileSync(sourceFile, 'utf-8')).join('\n');
  const explicit = new Map<string, string>();
  const traitPattern =
    /export interface (Has[A-Za-z0-9]+)\s*\{\s*readonly ([A-Za-z0-9]+):\s*\{\s*readonly ([A-Za-z0-9]+):\s*([A-Za-z0-9]+Backend)\s*;?\s*\}\s*;?\s*\}/g;
  for (const match of hostSource.matchAll(traitPattern)) {
    const [, trait, group, slot, backend] = match;
    const methods = methodsByBackend.get(backend);
    if (methods === undefined || !new RegExp(`\\b${trait}\\b`).test(production)) continue;
    const covered = [...methods].every((method) =>
      new RegExp(`\\.${group}\\s*\\.\\s*${slot}\\s*\\.\\s*${method}\\s*\\(`).test(production),
    );
    if (covered) explicit.set(backend.slice(0, -'Backend'.length), `Host.${group}.${slot}`);
  }
  return explicit;
}

// A narrower companion for lifecycle ownership. Calling every operation does not prove that an explicit
// Host provider can be released (Menu is the live counterexample), so this predicate additionally requires
// an exported destroy* boundary whose Host parameter names the exact Has* trait. Screen's older whole-group
// Host ownership predates this derivation and remains an explicit historical input at the caller.
export function collectExplicitHostLifecycleSlots(
  typeSourceFiles: readonly string[],
  productionSourceFiles: readonly string[],
): ReadonlyMap<string, string> {
  let hostSource = '';
  for (const sourceFile of typeSourceFiles) {
    if (sourceFile.endsWith('/Host.ts') || sourceFile.endsWith('\\Host.ts')) {
      hostSource = readFileSync(sourceFile, 'utf-8');
      break;
    }
  }
  const production = productionSourceFiles.map((sourceFile) => readFileSync(sourceFile, 'utf-8')).join('\n');
  const explicit = new Map<string, string>();
  const traitPattern =
    /export interface (Has[A-Za-z0-9]+)\s*\{\s*readonly ([A-Za-z0-9]+):\s*\{\s*readonly ([A-Za-z0-9]+):\s*([A-Za-z0-9]+Backend)\s*;?\s*\}\s*;?\s*\}/g;
  for (const match of hostSource.matchAll(traitPattern)) {
    const [, trait, group, slot, backend] = match;
    if (!new RegExp(`export function destroy[A-Za-z0-9]+\\s*\\([^)]*\\b${trait}\\b`).test(production)) continue;
    explicit.set(backend, `Host.${group}.${slot}`);
  }
  return explicit;
}

// Assembles the report. `exportsByPackage` is the live export set of every capability package, so
// migration is read from what the packages actually export.
export function createBackendOperationSeamReport(
  names: readonly string[],
  exportsByPackage: ReadonlyMap<string, ReadonlySet<string>>,
  explicitHostSlots: ReadonlyMap<string, string> = new Map(),
): BackendOperationSeamReport {
  const entries: BackendOperationSeamEntry[] = [];
  const violations: BackendOperationSeamViolation[] = [];
  for (const name of names) {
    let owner: string | null = null;
    for (const [packageName, exported] of exportsByPackage) {
      if (exported.has(`explain${name}Operation`)) {
        owner = packageName;
        break;
      }
    }
    owner ??= explicitHostSlots.get(name) ?? null;
    entries.push({ migrated: owner !== null, name, packageName: owner });
    if (owner === null) continue;
    // A migrated seam must ship both halves. `explain*` without `has*` leaves callers reading a record
    // where a boolean would do, and the two would drift.
    if (!owner.startsWith('Host.') && !(exportsByPackage.get(owner) ?? new Set()).has(`has${name}Operation`)) {
      violations.push({
        detail: `${owner} exports explain${name}Operation but not has${name}Operation`,
        name,
        rule: 'missing-has',
      });
    }
  }
  const enforced = entries.filter((entry) => entry.migrated).length;
  return { enforced, entries, notMigrated: entries.length - enforced, total: entries.length, violations };
}

// The line the gate prints on every run, in the ruled form. The two counts are printed together and their
// sum is asserted against the total by `hasBackendOperationSeamFailure`, so a mis-derivation surfaces as a
// partition that does not add up rather than as a quietly smaller enforced count.
export function formatBackendOperationSeamReport(report: Readonly<BackendOperationSeamReport>): string {
  const lines: string[] = [];
  lines.push(
    formatGateProvenance(
      {
        command: 'npx vitest run scripts/backend-operation-seam.test.ts (scripts/backend-operation-seam-core.ts)',
        counting:
          'one unit = one interface; enforced = its owning package exports explain<Name>Operation or a derived explicit Host slot is called for every non-lifecycle method; enforced + notMigrated is asserted equal to total',
        scope:
          'every exported *Backend interface in packages/types/src/*.ts, against the live contract-lane exports of every packages/*/ with a package.json; aggregator lanes that re-export another @flighthq package by name are excluded, because such a lane serves that package built output and would vouch for a deleted seam; no roster, no allowlist',
      },
      readGateTreeState(process.cwd()),
    ),
  );
  // ★ "interface shapes", deliberately. This gate checks a DECLARATION-level property — that a package
  // exports the per-operation seam for its interface — and nothing more. It does not compile consumers,
  // and a migrated interface can still break a downstream package that calls a newly optional operation
  // unguarded. Saying "interfaces enforced" invited exactly that reading once already.
  lines.push(
    `${report.enforced} of ${report.total} interface shapes enforced (declaration only; consumer builds not validated here), ${report.notMigrated} not yet migrated`,
  );
  lines.push(BACKEND_OPERATION_SEAM_SCOPE_CAVEAT);
  for (const entry of report.entries.filter((candidate) => candidate.migrated)) {
    lines.push(`  enforced  ${entry.name.padEnd(24)} ${entry.packageName ?? ''}`);
  }
  for (const violation of report.violations) {
    lines.push(`  VIOLATION ${violation.rule}: ${violation.detail}`);
  }
  return lines.join('\n');
}

// Fails on a violation, and equally on a partition that does not sum. The second is the one worth having:
// a derivation that drops an interface would otherwise report a smaller, entirely plausible `enforced`.
// ★ THE SCOPE CAVEAT, printed on every run beside the count and asserted by the tests so it cannot be
// dropped. This gate counts MIGRATION — an interface whose owning package exports the per-operation
// seam. That is a declaration, and the number is routinely read as "N operations work", which it has
// never meant: nothing here runs the operation, compiles a consumer, or looks at a test.
export const BACKEND_OPERATION_SEAM_SCOPE_CAVEAT = `STRUCTURAL: counts migration — explain/has exports or equal-coverage explicit Host calls; ${GATE_STRUCTURAL_LIMIT}, so it cannot say whether the operation behaves as declared`;

export function hasBackendOperationSeamFailure(report: Readonly<BackendOperationSeamReport>): boolean {
  return report.violations.length > 0 || report.enforced + report.notMigrated !== report.total;
}

// ★ THE SHADOW-OWNER EXCLUSION, and it is what makes this gate a ratchet rather than a thermometer.
//
// A lane that re-exports another package BY PACKAGE NAME (`export * from '@flighthq/media'`) does not
// report that package's source — the specifier resolves through the package entry to its BUILT output.
// So such a lane keeps serving a symbol the real owner has already deleted, and because ownership is
// "first package found exporting the seam", the barrel silently inherits it.
//
// Measured, not feared: renaming `explainAudioDeviceOperation` in `packages/media/src` left the count at
// 13 of 46 and moved the printed owner from `media` to `sdk`. A removal the gate exists to catch was
// invisible. Excluding aggregator lanes is what lets that same mutation fail.
//
// Derived from the file, not from a roster naming `sdk`: any future barrel matches the same predicate,
// and `sdk` is today the only lane in the repo that matches it (142 such re-exports).
export function isAggregatorContractLane(source: string): boolean {
  return /^export \* from '@flighthq\//m.test(source);
}
