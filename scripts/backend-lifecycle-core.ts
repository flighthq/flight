import type { Node } from 'oxc-parser';

import { getParsedOxcSource } from './oxc-source';

// The backend-replacement lifetime census.
//
// P4 requires that replacing or removing a process-global backend must not leak what the outgoing one
// held. The census derives, at build time, which backends CAN leak and whether their setter frees them.
//
// ★ THE EXCLUSION IS DERIVED, AND IT IS MOST OF THE POPULATION. A setter can only leak a resource its
// backend owns, and ownership is observable: the interface declares a NO-ARGUMENT teardown member
// (`destroy()` / `dispose()`). A per-object teardown — `TrayBackend.destroy(id)`,
// `WindowBackend.close(win)`, `NotificationBackend.closeNotification(id)` — frees one item, not the
// backend, so a setter has nothing to call for it and is correctly excluded. Counting those as
// violations would report 39 leaks where there is nothing to free.
//
// So the gate starts green and ratchets: it enforces only interfaces that have a whole-backend teardown
// hook, and reports how many do not yet have one. Adding a hook opts that backend in automatically.

export interface BackendLifecycleEntry {
  // The setter that installs this backend, or null when none was found.
  setter: string | null;
  interfaceName: string;
  // The no-argument teardown member the interface declares, or null when it owns nothing to free.
  teardown: string | null;
  // True when the setter's body references the teardown, so replacement cannot leak.
  tearsDown: boolean;
}

export interface BackendLifecycleViolation {
  detail: string;
  interfaceName: string;
  rule: 'setter-missing' | 'replacement-leaks';
}

export interface BackendLifecycleReport {
  entries: readonly BackendLifecycleEntry[];
  enforced: number;
  noTeardownHook: number;
  total: number;
  violations: readonly BackendLifecycleViolation[];
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

// Assembles the report. `setterBodies` maps a setter name to its source text, so "does the setter free the
// outgoing backend" is answered from the code rather than from a declaration about it.
export function createBackendLifecycleReport(
  interfaceNames: readonly string[],
  teardowns: ReadonlyMap<string, string>,
  setterBodies: ReadonlyMap<string, string>,
  helperBodies: ReadonlyMap<string, string> = new Map(),
): BackendLifecycleReport {
  const entries: BackendLifecycleEntry[] = [];
  const violations: BackendLifecycleViolation[] = [];
  for (const interfaceName of interfaceNames) {
    const teardown = teardowns.get(interfaceName) ?? null;
    const setter = findSetterName(interfaceName, setterBodies);
    const body = setter === null ? null : (setterBodies.get(setter) ?? null);
    const tearsDown = body !== null && teardown !== null && reachesTeardown(body, teardown, helperBodies);
    entries.push({ interfaceName, setter, teardown, tearsDown });
    if (teardown === null) continue;
    if (setter === null) {
      violations.push({
        detail: `${interfaceName} declares ${teardown}() but no set*Backend installs it`,
        interfaceName,
        rule: 'setter-missing',
      });
      continue;
    }
    if (!tearsDown) {
      violations.push({
        detail: `${setter} replaces the backend without calling ${teardown}, so the outgoing one leaks`,
        interfaceName,
        rule: 'replacement-leaks',
      });
    }
  }
  const enforced = entries.filter((entry) => entry.teardown !== null).length;
  return { entries, enforced, noTeardownHook: entries.length - enforced, total: entries.length, violations };
}

// The line the gate prints every run. Both counts together, and their sum asserted against the total by
// `hasBackendLifecycleFailure`, so a derivation that drops an interface shows as a partition that does not
// add up rather than as a quietly smaller enforced count.
export function formatBackendLifecycleReport(report: Readonly<BackendLifecycleReport>): string {
  const lines: string[] = [];
  lines.push(
    `${report.enforced} of ${report.total} backends own a freeable resource, ${report.noTeardownHook} declare no whole-backend teardown`,
  );
  for (const entry of report.entries.filter((candidate) => candidate.teardown !== null)) {
    lines.push(
      `  ${entry.tearsDown ? 'frees  ' : 'LEAKS  '} ${entry.interfaceName.padEnd(24)} ${entry.setter ?? '(no setter)'} → ${entry.teardown}()`,
    );
  }
  for (const violation of report.violations) lines.push(`  VIOLATION ${violation.rule}: ${violation.detail}`);
  return lines.join('\n');
}

export function hasBackendLifecycleFailure(report: Readonly<BackendLifecycleReport>): boolean {
  return report.violations.length > 0 || report.enforced + report.noTeardownHook !== report.total;
}

// `LogTransportBackend` → `setLogTransportBackend`. Derived from the interface name rather than mapped,
// so a new backend is picked up without an entry anywhere.
function findSetterName(interfaceName: string, setterBodies: ReadonlyMap<string, string>): string | null {
  const candidate = `set${interfaceName.slice(0, -'Backend'.length)}Backend`;
  return setterBodies.has(candidate) ? candidate : null;
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

// Whether the setter frees the outgoing backend, directly or through a helper it calls.
//
// ★ One hop matters, and a text match on the setter alone is not enough. A setter that delegates to a
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
