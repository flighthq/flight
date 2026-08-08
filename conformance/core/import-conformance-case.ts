import { createHash } from 'node:crypto';

export interface ImportConformanceCaseMember {
  reference: string;
  role: string;
  sourceHash: string;
}

export interface ImportConformanceCaseIdentity {
  caseHash: string;
  members: readonly ImportConformanceCaseMember[];
  reference: string;
}

export type ImportConformanceOracleEvidence =
  | boolean
  | number
  | string
  | null
  | readonly ImportConformanceOracleEvidence[]
  | { readonly [key: string]: ImportConformanceOracleEvidence };

export interface ImportConformanceOracleOutcome {
  evidence: ImportConformanceOracleEvidence;
  id: string;
  notRunReason?: string;
  state: 'failed' | 'not-run' | 'passed';
}

export interface ImportConformancePackFilePolicy {
  excludedPathSegments?: ReadonlySet<string>;
  extensions: readonly string[];
  rootMetadataReferences?: ReadonlySet<string>;
}

/**
 * Build the content identity shared by indexing, sharding, cache rows, and score evidence.
 * Member input order is deliberately irrelevant: a case is a non-empty set, not a worker argv list.
 */
export function createImportConformanceCaseIdentity(
  reference: string,
  members: readonly Readonly<ImportConformanceCaseMember>[],
): ImportConformanceCaseIdentity {
  assertCaseReference(reference);
  if (members.length === 0) throw new Error(`Conformance case ${reference} must contain at least one member`);
  const normalized = members.map(normalizeMember).sort(compareMember);
  for (let index = 1; index < normalized.length; index++) {
    if (compareMember(normalized[index - 1]!, normalized[index]!) === 0) {
      throw new Error(`Conformance case ${reference} contains a duplicate member`);
    }
  }
  return {
    caseHash: hashMembers(normalized),
    members: normalized,
    reference,
  };
}

export function createImportConformanceSingleMemberCaseIdentity(
  reference: string,
  sourceHash: string,
  role = 'source',
): ImportConformanceCaseIdentity {
  return createImportConformanceCaseIdentity(reference, [{ reference, role, sourceHash }]);
}

export function assertImportConformanceOracleOutcomes(
  outcomes: readonly Readonly<ImportConformanceOracleOutcome>[],
  context = 'oracle outcomes',
): void {
  let previous = '';
  for (const outcome of outcomes) {
    if (!isIdentifier(outcome.id)) throw new Error(`${context} contain invalid oracle id '${outcome.id}'`);
    if (outcome.state !== 'failed' && outcome.state !== 'passed' && outcome.state !== 'not-run') {
      throw new Error(`${context} contain invalid state for '${outcome.id}'`);
    }
    if (outcome.state === 'not-run') {
      if (outcome.notRunReason === undefined || !isIdentifier(outcome.notRunReason)) {
        throw new Error(`${context} require a stable not-run reason for '${outcome.id}'`);
      }
    } else if (outcome.notRunReason !== undefined) {
      throw new Error(`${context} cannot attach a not-run reason to '${outcome.id}' in state '${outcome.state}'`);
    }
    assertEvidence(outcome.evidence, `${context} '${outcome.id}' evidence`);
    if (outcome.id <= previous) throw new Error(`${context} must be sorted and unique by oracle id`);
    previous = outcome.id;
  }
}

export function parseImportConformanceOracleOutcomes(
  value: unknown,
  context = 'oracle outcomes',
): ImportConformanceOracleOutcome[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  const outcomes = value.map((candidate, index): ImportConformanceOracleOutcome => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new Error(`${context}[${index}] must be an object`);
    }
    const record = candidate as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const expectedKeys =
      record.state === 'not-run' ? ['evidence', 'id', 'notRunReason', 'state'] : ['evidence', 'id', 'state'];
    if (keys.join('\0') !== expectedKeys.join('\0')) throw new Error(`${context}[${index}] has unexpected fields`);
    if (typeof record.id !== 'string' || typeof record.state !== 'string') {
      throw new Error(`${context}[${index}] has invalid identity or state`);
    }
    assertEvidence(record.evidence, `${context}[${index}].evidence`);
    return {
      evidence: record.evidence,
      id: record.id,
      ...(record.notRunReason === undefined ? {} : { notRunReason: record.notRunReason as string }),
      state: record.state as ImportConformanceOracleOutcome['state'],
    };
  });
  assertImportConformanceOracleOutcomes(outcomes, context);
  return outcomes;
}

function assertEvidence(value: unknown, context: string): asserts value is ImportConformanceOracleEvidence {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${context} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assertEvidence(value[index]!, `${context}[${index}]`);
    return;
  }
  if (typeof value !== 'object') throw new Error(`${context} is not canonical JSON evidence`);
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record);
  if (keys.some((key) => !/^[a-z][A-Za-z0-9]*$/.test(key))) {
    throw new Error(`${context} contains an invalid field name`);
  }
  for (const key of keys) assertEvidence(record[key]!, `${context}.${key}`);
}

export function isImportConformancePackFileReference(
  reference: string,
  policy: Readonly<ImportConformancePackFilePolicy>,
): boolean {
  if (reference.length === 0 || reference.includes('\\')) return false;
  const segments = reference.split('/');
  if (segments.length === 1 && policy.rootMetadataReferences?.has(reference) === true) return false;
  if (segments.some((segment) => policy.excludedPathSegments?.has(segment) === true)) return false;
  const lower = reference.toLowerCase();
  return policy.extensions.some((extension) => {
    if (!/^\.[a-z0-9]+$/.test(extension)) throw new Error(`Invalid conformance pack extension '${extension}'`);
    return lower.endsWith(extension);
  });
}

function normalizeMember(member: Readonly<ImportConformanceCaseMember>): ImportConformanceCaseMember {
  if (!isIdentifier(member.role)) throw new Error(`Invalid conformance case member role '${member.role}'`);
  assertCaseReference(member.reference);
  assertSha256(member.sourceHash, `case member ${member.reference} source hash`);
  return { reference: member.reference, role: member.role, sourceHash: member.sourceHash };
}

function assertCaseReference(reference: string): void {
  if (reference.length === 0 || reference.includes('\0') || reference.includes('\\')) {
    throw new Error('A conformance case reference must be a non-empty portable path without NUL bytes');
  }
}

function assertSha256(value: string, context: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${context} must be a lowercase SHA-256`);
}

function isIdentifier(value: string): boolean {
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value);
}

function compareMember(
  left: Readonly<ImportConformanceCaseMember>,
  right: Readonly<ImportConformanceCaseMember>,
): number {
  return left.role < right.role
    ? -1
    : left.role > right.role
      ? 1
      : left.reference < right.reference
        ? -1
        : left.reference > right.reference
          ? 1
          : left.sourceHash < right.sourceHash
            ? -1
            : left.sourceHash > right.sourceHash
              ? 1
              : 0;
}

function hashMembers(members: readonly Readonly<ImportConformanceCaseMember>[]): string {
  const hash = createHash('sha256');
  hash.update('import-conformance-case-v1\0');
  for (const member of members) {
    hash.update(member.role);
    hash.update('\0');
    hash.update(member.reference);
    hash.update('\0');
    hash.update(member.sourceHash);
    hash.update('\0');
  }
  return hash.digest('hex');
}
