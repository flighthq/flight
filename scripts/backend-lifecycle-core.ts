import type { Node } from 'oxc-parser';

import { formatGateProvenance, GATE_STRUCTURAL_LIMIT, readGateTreeState } from './gate-provenance';
import { getParsedOxcSource } from './oxc-source';

// The backend-provider lifetime census.
//
// P4 requires that releasing a provider must not leak what it held. The census derives, at build time,
// which backends declare a whole-provider teardown and whether an owning lifecycle path reaches it.
//
// ★ THE EXCLUSION IS DERIVED, AND IT IS MOST OF THE POPULATION. A lifecycle path can only leak a
// resource its backend owns, and ownership is observable: the interface declares a NO-ARGUMENT teardown member
// (`destroy()` / `dispose()`). A per-object teardown — `TrayBackend.destroy(id)`,
// `WindowBackend.close(win)`, `NotificationCloseBackend.closeNotification(id)` — frees one item, not the
// backend, so a final owner has nothing to call for it and is correctly excluded. Counting those as
// violations would report 39 leaks where there is nothing to free.
//
// Most ambient seams are owned by set*Backend replacement. Explicit Host slots instead have a
// destroyThing(host: HasThingProvider) or destroyThingCapabilities(host: HasThingLifecycle) owner: the
// Host's constructor/sharer decides the final release.
// Those are separate, derived lanes so an explicit provider is never disguised as an ambient setter.

export interface BackendLifecycleOwner {
  body: string;
  name: string;
}

export interface BackendLifecycleEntry {
  interfaceName: string;
  // The lifecycle path that owns final release, or null when none was found.
  owner: string | null;
  ownerKind: 'explicit-host-destroy' | 'explicit-host-slot' | 'setter' | null;
  // The no-argument teardown member the interface declares, or null when it owns nothing to free.
  teardown: string | null;
  // True when the owner's body reaches the teardown, directly or through one helper.
  tearsDown: boolean;
}

export interface BackendLifecycleViolation {
  detail: string;
  interfaceName: string;
  rule: 'owner-missing' | 'teardown-unwired';
}

export interface BackendLifecycleDelta {
  enforcedGained: readonly string[];
  enforcedLost: readonly string[];
  seamsAdded: readonly string[];
  seamsRemoved: readonly string[];
}

export interface BackendLifecycleFloor {
  enforcedNames: readonly string[];
  total: number;
}

export interface BackendLifecycleReport {
  entries: readonly BackendLifecycleEntry[];
  enforced: number;
  enforcedNames: readonly string[];
  noTeardownHook: number;
  total: number;
  violations: readonly BackendLifecycleViolation[];
}

// The empty report, owned beside the type it builds. A fixture that needs a VALID report rather than a
// particular one starts here and overrides only the fields under test, so a field added to
// `BackendLifecycleReport` is supplied in this one place instead of at every construction site.
//
// This exists because the opposite happened: `enforcedNames` was added to the interface and had to be
// hand-applied to TEN fixture sites. Nine were found; the tenth — a provenance fixture that never reads
// the report's contents at all — was missed, and broke the root typecheck.
//
// Ten is measured, not recalled: adding one required field to the interface and counting the compiler's
// complaints gives 11 sites before the factory (10 fixtures + the real producer) and 2 after (this
// factory + the real producer). The producer must genuinely compute a new field, so it SHOULD appear;
// the fixtures should not, and now do not.
export function createEmptyBackendLifecycleReport(): BackendLifecycleReport {
  return {
    enforced: 0,
    enforcedNames: [],
    entries: [],
    noTeardownHook: 0,
    total: 0,
    violations: [],
  };
}

// Interfaces that own something to free, keyed by name, with the teardown member's name.
//
// A member counts only when it takes NO parameters. That single condition is what separates "free what
// this backend owns" from "free one of the things it manages", and it is read from the signature rather
// than guessed from the verb.
export function collectWholeBackendTeardowns(typeSourceFiles: readonly string[]): ReadonlyMap<string, string> {
  const teardowns = new Map<string, string>();
  for (const sourceFile of typeSourceFiles) {
    for (const statement of getParsedOxcSource(sourceFile).program.body) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      const declaration = statement.declaration;
      if (declaration === null || declaration.type !== 'TSInterfaceDeclaration') continue;
      if (!declaration.id.name.endsWith('Backend')) continue;
      for (const member of declaration.body.body) {
        const name = teardownMemberName(member);
        if (name === null) continue;
        teardowns.set(declaration.id.name, name);
      }
    }
  }
  return teardowns;
}

// Explicit Host-provider lifecycle owners, keyed by the backend interface they release.
//
// A function is admitted only when all three pieces agree structurally:
//   destroyThing(host: HasThingProvider) -> ThingBackend,
//   destroyThing(host: HasThingFacet) -> ThingFacetBackend, or
//   destroyThingCapabilities(host: HasThingLifecycle) -> ThingLifecycleBackend.
// This keeps an unrelated destroyThing helper from satisfying the lane, and makes the first-parameter
// Host trait part of the proof rather than a naming convention described only in prose.
export function collectExplicitHostDestroyOwners(
  sourceFiles: readonly string[],
): ReadonlyMap<string, BackendLifecycleOwner> {
  const owners = new Map<string, BackendLifecycleOwner>();
  for (const sourceFile of sourceFiles) {
    const { program, text } = getParsedOxcSource(sourceFile);
    for (const statement of program.body) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      const declaration = statement.declaration;
      if (declaration === null || declaration.type !== 'FunctionDeclaration') continue;
      if (declaration.id === null || declaration.body === null) continue;
      const name = declaration.id.name;
      if (!name.startsWith('destroy') || name.endsWith('Backend')) continue;
      // Oxc's declaration.params element type is narrower than its runtime Identifier nodes.
      const parameter = declaration.params[0] as Node | undefined;
      if (parameter?.type !== 'Identifier') continue;
      const annotation = parameter.typeAnnotation?.typeAnnotation;
      if (annotation?.type !== 'TSTypeReference' || annotation.typeName.type !== 'Identifier') continue;
      const interfaceName = explicitHostDestroyBackendName(name, annotation.typeName.name);
      if (interfaceName === null) continue;
      owners.set(interfaceName, {
        body: text.slice(declaration.body.start + 1, declaration.body.end - 1),
        name,
      });
    }
  }
  return owners;
}

// Assembles the report. Ambient setters and explicit Host-provider destroy functions are supplied in
// distinct maps, so the report can state which ownership model it actually verified.
export function createBackendLifecycleReport(
  interfaceNames: readonly string[],
  teardowns: ReadonlyMap<string, string>,
  setterBodies: ReadonlyMap<string, string>,
  helperBodies: ReadonlyMap<string, string> = new Map(),
  explicitHostOwners: ReadonlyMap<string, BackendLifecycleOwner> = new Map(),
  explicitHostSlots: ReadonlyMap<string, string> = new Map(),
): BackendLifecycleReport {
  const entries: BackendLifecycleEntry[] = [];
  const violations: BackendLifecycleViolation[] = [];
  for (const interfaceName of interfaceNames) {
    const teardown = teardowns.get(interfaceName) ?? null;
    const setter = findSetterName(interfaceName, setterBodies);
    const explicitHostOwner = explicitHostOwners.get(interfaceName) ?? null;
    const explicitHostSlot = explicitHostSlots.get(interfaceName) ?? null;
    const owner = explicitHostOwner?.name ?? explicitHostSlot ?? setter;
    const ownerKind =
      explicitHostOwner !== null
        ? 'explicit-host-destroy'
        : explicitHostSlot !== null
          ? 'explicit-host-slot'
          : setter === null
            ? null
            : 'setter';
    const body = explicitHostOwner?.body ?? (setter === null ? null : (setterBodies.get(setter) ?? null));
    const tearsDown =
      explicitHostSlot !== null ||
      (body !== null && teardown !== null && reachesTeardown(body, teardown, helperBodies));
    entries.push({ interfaceName, owner, ownerKind, teardown, tearsDown });
    if (teardown === null) continue;
    if (owner === null) {
      violations.push({
        detail: `${interfaceName} declares ${teardown}() but no set*Backend or structurally matched Host destroy owner owns final release`,
        interfaceName,
        rule: 'owner-missing',
      });
      continue;
    }
    if (!tearsDown) {
      violations.push({
        detail: `${owner} owns final release without calling ${teardown}, so the provider leaks`,
        interfaceName,
        rule: 'teardown-unwired',
      });
    }
  }
  const enforcedEntries = entries.filter((entry) => entry.teardown !== null);
  const enforced = enforcedEntries.length;
  const enforcedNames = enforcedEntries.map((entry) => entry.interfaceName).sort();
  return {
    entries,
    enforced,
    enforcedNames,
    noTeardownHook: entries.length - enforced,
    total: entries.length,
    violations,
  };
}

// Compares two reports and categorizes every change: denominator growth (new interfaces) is separated
// from numerator regression (previously-enforced interfaces that lost their teardown hook).
export function compareBackendLifecycleReports(
  prior: Readonly<Pick<BackendLifecycleReport, 'enforcedNames' | 'entries'>>,
  current: Readonly<BackendLifecycleReport>,
): BackendLifecycleDelta {
  const priorNames = new Set(prior.entries.map((entry) => entry.interfaceName));
  const currentNames = new Set(current.entries.map((entry) => entry.interfaceName));
  const priorEnforced = new Set(prior.enforcedNames);
  const currentEnforced = new Set(current.enforcedNames);
  return {
    enforcedGained: current.enforcedNames.filter((name) => !priorEnforced.has(name)),
    enforcedLost: [...priorEnforced].filter((name) => !currentEnforced.has(name)).sort(),
    seamsAdded: [...currentNames].filter((name) => !priorNames.has(name)).sort(),
    seamsRemoved: [...priorNames].filter((name) => !currentNames.has(name)).sort(),
  };
}

export function formatBackendLifecycleDelta(delta: Readonly<BackendLifecycleDelta>): string {
  const parts: string[] = [];
  if (delta.seamsAdded.length > 0)
    parts.push(`+${delta.seamsAdded.length} new seam${delta.seamsAdded.length === 1 ? '' : 's'}`);
  if (delta.seamsRemoved.length > 0) parts.push(`-${delta.seamsRemoved.length} removed`);
  if (delta.enforcedGained.length > 0) parts.push(`+${delta.enforcedGained.length} newly enforced`);
  if (delta.enforcedLost.length > 0)
    parts.push(`${delta.enforcedLost.length} regression${delta.enforcedLost.length === 1 ? '' : 's'}`);
  else parts.push('0 regressions');
  return parts.join(', ');
}

// The line the gate prints every run. Both counts together, and their sum asserted against the total by
// `hasBackendLifecycleFailure`, so a derivation that drops an interface shows as a partition that does not
// add up rather than as a quietly smaller enforced count.
export function formatBackendLifecycleReport(
  report: Readonly<BackendLifecycleReport>,
  floor?: Readonly<BackendLifecycleFloor>,
  retiredEnforcedNames: readonly string[] = [],
): string {
  const lines: string[] = [];
  lines.push(
    formatGateProvenance(
      {
        command: 'npx vitest run scripts/backend-lifecycle.test.ts (scripts/backend-lifecycle-core.ts)',
        counting:
          'one unit = one interface; counted = DECLARES a ZERO-PARAMETER destroy/dispose in method or property syntax (a per-object teardown taking an id is excluded) AND an ambient set*Backend, structurally matched explicit Host destroy owner, or explicit Host slot owns its lifetime; this is declaration and wiring only, never evidence that destroy releases what the backend owns; enforced + noTeardownHook is asserted equal to total',
        scope:
          'every exported *Backend interface in packages/types/src/*.ts, plus every exported ambient set*Backend, structurally matched explicit Host destroy owner, and top-level function body in packages/*/src/*.ts; *.test.ts excluded',
      },
      readGateTreeState(process.cwd()),
    ),
  );
  // ★ "declare a whole-backend teardown hook", NOT "own a freeable resource". The gate reads
  // DECLARATIONS: an interface member and an ambient-setter or explicit-Host owner that names it. It cannot see whether
  // `destroy()` releases what the backend actually holds, and the audit in
  // `agents/backend-lifecycle-ownership.md` found live rows where it does not — a counted backend whose
  // host-installed instance has no reachable teardown at all, and counted rows that release state they
  // never acquired. Wording that says "own a freeable resource" invites the reading that the numerator
  // is a completeness measure, and that reading is what this line must not support.
  const summary = `${report.enforced} of ${report.total} backends declare a whole-backend teardown hook, ${report.noTeardownHook} declare none`;
  if (floor !== undefined) {
    const delta = compareFloorToReport(floor, report, retiredEnforcedNames);
    lines.push(`${summary} (${formatBackendLifecycleDelta(delta)})`);
  } else {
    lines.push(summary);
  }
  lines.push(BACKEND_LIFECYCLE_SCOPE_CAVEAT);
  for (const entry of report.entries.filter((candidate) => candidate.teardown !== null)) {
    lines.push(
      `  ${entry.tearsDown ? 'wired   ' : 'UNWIRED '} ${entry.interfaceName.padEnd(24)} ${entry.owner ?? '(no owner)'} [${entry.ownerKind ?? 'none'}] → ${entry.teardown}()`,
    );
  }
  for (const violation of report.violations) lines.push(`  VIOLATION ${violation.rule}: ${violation.detail}`);
  return lines.join('\n');
}

// ★ THE SCOPE CAVEAT, printed on every run and asserted by the tests so it cannot be quietly dropped.
//
// This gate answers one question — is a whole-backend teardown DECLARED and NAMED by its lifecycle owner — and
// the number it prints is routinely read as "N backends clean up correctly", which it has never meant.
// The audit in `agents/backend-lifecycle-ownership.md` measured the gap on the live tree: rows this gate
// counts include one whose host-installed instance has no reachable teardown at all, and ones whose
// destroy releases host state they never acquired. Both are invisible here, by construction.
//
// It rides in the output rather than in a doc because the output is what gets pasted into reports.
export const BACKEND_LIFECYCLE_SCOPE_CAVEAT = `STRUCTURAL: counts hook presence — a zero-parameter destroy/dispose named by an ambient setter or explicit Host-provider destroy owner, or owned by an explicit Host slot; ${GATE_STRUCTURAL_LIMIT}, so it cannot say whether destroy releases what a backend owns. See agents/backend-lifecycle-ownership.md`;

export function hasBackendLifecycleFailure(report: Readonly<BackendLifecycleReport>): boolean {
  return report.violations.length > 0 || report.enforced + report.noTeardownHook !== report.total;
}

function explicitHostDestroyBackendName(functionName: string, traitName: string): string | null {
  const stem = functionName.slice('destroy'.length);
  if (stem.length === 0) return null;
  if (traitName === `Has${stem}Provider`) return `${stem}Backend`;
  if (stem.endsWith('Capabilities')) {
    const capabilityStem = stem.slice(0, -'Capabilities'.length);
    if (capabilityStem.length > 0 && traitName === `Has${capabilityStem}Lifecycle`)
      return `${capabilityStem}LifecycleBackend`;
  }
  if (!traitName.startsWith(`Has${stem}`)) return null;
  const facet = traitName.slice(`Has${stem}`.length);
  return facet.length === 0 ? null : `${stem}${facet}Backend`;
}

// `MediaSessionBackend` → `setMediaSessionBackend`. Derived from the interface name rather than mapped,
// so a new backend is picked up without an entry anywhere.
// The wiring that owns a backend's final release. Under the ambient model that was always a
// `set<Name>Backend`; a migrated domain has no setter at all and instead exports an explicit Host
// boundary, `destroy<Name>`, which destroys every distinct supplied provider exactly once.
//
// ★ Recognizing only the setter made a CORRECTLY migrated domain red by construction: deleting the
// ambient setter — the whole point of the migration — removed the only thing this reader could see, so
// the gate reported "unwired" for backends whose ownership had actually become explicit.
function findSetterName(interfaceName: string, setterBodies: ReadonlyMap<string, string>): string | null {
  const base = interfaceName.slice(0, -'Backend'.length);
  const setter = `set${base}Backend`;
  if (setterBodies.has(setter)) return setter;
  const boundary = `destroy${base}`;
  return setterBodies.has(boundary) ? boundary : null;
}

// A zero-parameter `destroy`/`dispose` member, in EITHER declaration syntax.
//
// ★ Reading only `TSMethodSignature` is a real blind spot, not a hypothetical one: `TextShaperBackend`
// already declares all six of its optional operations in property form (`shapeRun?: (…) => …`), so a
// method-syntax-only reader misses them silently. No backend declares a property-form teardown TODAY,
// which is why closing this changes no count — but the first one written that way would have made this
// gate under-report while still printing a confident green.
function teardownMemberName(member: Node): string | null {
  if (member.type === 'TSMethodSignature') {
    if (member.key.type !== 'Identifier') return null;
    if (member.key.name !== 'destroy' && member.key.name !== 'dispose') return null;
    return member.params.length > 0 ? null : member.key.name;
  }
  if (member.type !== 'TSPropertySignature' || member.key.type !== 'Identifier') return null;
  if (member.key.name !== 'destroy' && member.key.name !== 'dispose') return null;
  const annotation = member.typeAnnotation?.typeAnnotation;
  if (annotation === undefined || annotation.type !== 'TSFunctionType') return null;
  return annotation.params.length > 0 ? null : member.key.name;
}

// The method-syntax-only reader this gate used to be, kept as a SECOND opinion rather than deleted.
//
// Its only purpose is to make the widening's effect on the live population checkable instead of asserted:
// comparing it against `collectWholeBackendTeardowns` says, executably, whether accepting property-form
// members changed which backends are counted. Today it changes nothing, and the test that compares them
// records why. The day a property-form teardown is written, the two disagree and the comparison fails —
// which is the correct moment for someone to update the recorded count rather than discover it later.
export function collectMethodSyntaxTeardowns(typeSourceFiles: readonly string[]): ReadonlyMap<string, string> {
  const teardowns = new Map<string, string>();
  for (const sourceFile of typeSourceFiles) {
    for (const statement of getParsedOxcSource(sourceFile).program.body) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      const declaration = statement.declaration;
      if (declaration === null || declaration.type !== 'TSInterfaceDeclaration') continue;
      if (!declaration.id.name.endsWith('Backend')) continue;
      for (const member of declaration.body.body) {
        if (member.type !== 'TSMethodSignature' || member.key.type !== 'Identifier') continue;
        if (member.key.name !== 'destroy' && member.key.name !== 'dispose') continue;
        if (member.params.length > 0) continue;
        teardowns.set(declaration.id.name, member.key.name);
      }
    }
  }
  return teardowns;
}

export function compareFloorToReport(
  floor: Readonly<BackendLifecycleFloor>,
  current: Readonly<BackendLifecycleReport>,
  retiredEnforcedNames: readonly string[] = [],
): BackendLifecycleDelta {
  const floorEnforced = new Set(floor.enforcedNames);
  const currentEnforced = new Set(current.enforcedNames);
  const retiredEnforced = new Set(retiredEnforcedNames);
  const totalGrowth = current.total - floor.total;
  const seamsAdded: string[] = [];
  for (let i = 0; i < totalGrowth; i++) seamsAdded.push(`(+${i + 1})`);
  const seamsRemoved: string[] = [];
  for (let i = 0; i < -totalGrowth; i++) seamsRemoved.push(`(-${i + 1})`);
  return {
    enforcedGained: current.enforcedNames.filter((name) => !floorEnforced.has(name)),
    enforcedLost: [...floorEnforced].filter((name) => !retiredEnforced.has(name) && !currentEnforced.has(name)).sort(),
    seamsAdded,
    seamsRemoved,
  };
}

// Whether the lifecycle owner frees the provider, directly or through a helper it calls.
//
// ★ One hop matters, and a text match on the owner alone is not enough. A setter that delegates to a
// `release*Backends(previous)` helper — which is what correct layered ownership looks like, because
// "destroy whatever is no longer referenced by any slot" does not fit inline — contains no `destroy`
// token at all. Matching only the setter body reported those setters as LEAKING while they were the two
// most careful ones in the repo. A false leak is as corrosive as a false green: it teaches the reader to
// discount the gate.
function reachesTeardown(body: string, teardown: string, helperBodies: ReadonlyMap<string, string>): boolean {
  if (body.includes(teardown)) return true;
  for (const [name, helperBody] of helperBodies) {
    if (!body.includes(`${name}(`)) continue;
    if (helperBody.includes(teardown)) return true;
  }
  return false;
}
