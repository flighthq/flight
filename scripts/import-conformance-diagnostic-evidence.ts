import type { ImportDiagnostic } from '@flighthq/types/contract';

export interface ImportConformanceRetainedDiagnostic {
  detail?: Readonly<Record<string, number | string>>;
  kind: string;
  origin: string;
  severity: ImportDiagnostic['severity'];
}

export type ImportConformanceDiagnosticDetailRule =
  | { kind: 'capability-id' }
  | { kind: 'nonnegative-integer' }
  | { kind: 'string-enum'; values: readonly string[] };

export interface ImportConformanceDiagnosticDetailPolicy {
  field: string;
  rule: ImportConformanceDiagnosticDetailRule;
}

export interface ImportConformanceDiagnosticEvidencePolicy {
  detail: readonly Readonly<ImportConformanceDiagnosticDetailPolicy>[];
  id: string;
  unsupportedDiagnosticKinds: readonly string[];
}

export const SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY: ImportConformanceDiagnosticEvidencePolicy = {
  detail: [
    { field: 'capability', rule: { kind: 'capability-id' } },
    { field: 'characterId', rule: { kind: 'nonnegative-integer' } },
    { field: 'compression', rule: { kind: 'string-enum', values: ['deflate', 'lzma'] } },
    { field: 'frame', rule: { kind: 'nonnegative-integer' } },
    { field: 'length', rule: { kind: 'nonnegative-integer' } },
    { field: 'sceneCount', rule: { kind: 'nonnegative-integer' } },
  ],
  id: 'swf-diagnostic-evidence-v1',
  unsupportedDiagnosticKinds: ['swf.no-decompressor-registered'],
};

export const NO_IMPORT_CONFORMANCE_DIAGNOSTIC_DETAIL_POLICY: ImportConformanceDiagnosticEvidencePolicy = {
  detail: [],
  id: 'no-diagnostic-evidence-v1',
  unsupportedDiagnosticKinds: [],
};

/**
 * Retain only fields whose licence treatment has been decided. Diagnostic kind, origin, and severity are
 * Flight-owned vocabulary. Capability and compression are Flight-owned tags; the four numeric fields are
 * counts or indices. Fixture-derived names/text and every future detail field stay absent until explicitly ruled in.
 */
export function retainImportConformanceDiagnostic(
  diagnostic: Readonly<ImportDiagnostic>,
  capabilityIds: ReadonlySet<string>,
  policy: Readonly<ImportConformanceDiagnosticEvidencePolicy>,
): ImportConformanceRetainedDiagnostic {
  const detail = retainDecidedDetail(diagnostic.detail, capabilityIds, policy);
  return {
    ...(detail === undefined ? {} : { detail }),
    kind: diagnostic.kind,
    origin: diagnostic.origin,
    severity: diagnostic.severity,
  };
}

export function assertImportConformanceDiagnosticEvidencePolicy(
  policy: Readonly<ImportConformanceDiagnosticEvidencePolicy>,
): void {
  assertIdentifier(policy.id, 'diagnostic evidence policy id');
  let previous = '';
  for (const entry of policy.detail) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(entry.field)) throw new Error('invalid diagnostic detail policy field');
    if (entry.field <= previous) throw new Error('diagnostic detail policy fields must be sorted and unique');
    const rule = entry.rule;
    if (rule.kind === 'string-enum') {
      if (rule.values.length === 0) throw new Error(`diagnostic detail policy ${entry.field} enum must not be empty`);
      let previousValue = '';
      for (const value of rule.values) {
        assertIdentifier(value, `diagnostic detail policy ${entry.field} enum value`);
        if (value <= previousValue) {
          throw new Error(`diagnostic detail policy ${entry.field} enum values must be sorted and unique`);
        }
        previousValue = value;
      }
    } else if (rule.kind !== 'capability-id' && rule.kind !== 'nonnegative-integer') {
      throw new Error(`invalid diagnostic detail policy rule for ${entry.field}`);
    }
    previous = entry.field;
  }
  let previousKind = '';
  for (const kind of policy.unsupportedDiagnosticKinds) {
    assertIdentifier(kind, 'unsupported diagnostic kind');
    if (kind <= previousKind) throw new Error('unsupported diagnostic kinds must be sorted and unique');
    previousKind = kind;
  }
}

export function cloneImportConformanceDiagnosticEvidencePolicy(
  policy: Readonly<ImportConformanceDiagnosticEvidencePolicy>,
): ImportConformanceDiagnosticEvidencePolicy {
  assertImportConformanceDiagnosticEvidencePolicy(policy);
  return {
    detail: policy.detail.map((entry) => ({
      field: entry.field,
      rule:
        entry.rule.kind === 'string-enum'
          ? { kind: entry.rule.kind, values: [...entry.rule.values] }
          : { kind: entry.rule.kind },
    })),
    id: policy.id,
    unsupportedDiagnosticKinds: [...policy.unsupportedDiagnosticKinds],
  };
}

export function parseImportConformanceDiagnosticEvidencePolicy(
  value: unknown,
): ImportConformanceDiagnosticEvidencePolicy {
  if (
    !isRecord(value) ||
    !Array.isArray(value.detail) ||
    typeof value.id !== 'string' ||
    !Array.isArray(value.unsupportedDiagnosticKinds)
  ) {
    throw new Error('invalid diagnostic evidence policy');
  }
  expectExactKeys(value, ['detail', 'id', 'unsupportedDiagnosticKinds'], 'diagnostic evidence policy');
  const policy: ImportConformanceDiagnosticEvidencePolicy = {
    detail: value.detail.map((candidate) => {
      if (!isRecord(candidate) || typeof candidate.field !== 'string' || !isRecord(candidate.rule)) {
        throw new Error('invalid diagnostic detail policy');
      }
      expectExactKeys(candidate, ['field', 'rule'], `diagnostic detail policy ${candidate.field}`);
      const kind = candidate.rule.kind;
      if (kind === 'string-enum') {
        expectExactKeys(candidate.rule, ['kind', 'values'], `diagnostic detail policy ${candidate.field} rule`);
        if (!Array.isArray(candidate.rule.values)) throw new Error('invalid diagnostic detail string enum');
        return {
          field: candidate.field,
          rule: {
            kind,
            values: candidate.rule.values.map((entry) => {
              if (typeof entry !== 'string') throw new Error('invalid diagnostic detail string enum value');
              return entry;
            }),
          },
        };
      }
      if (kind !== 'capability-id' && kind !== 'nonnegative-integer') {
        throw new Error(`invalid diagnostic detail policy rule for ${candidate.field}`);
      }
      expectExactKeys(candidate.rule, ['kind'], `diagnostic detail policy ${candidate.field} rule`);
      return { field: candidate.field, rule: { kind } };
    }),
    id: value.id,
    unsupportedDiagnosticKinds: value.unsupportedDiagnosticKinds.map((kind) => {
      if (typeof kind !== 'string') throw new Error('invalid unsupported diagnostic kind');
      return kind;
    }),
  };
  assertImportConformanceDiagnosticEvidencePolicy(policy);
  return policy;
}

export function parseImportConformanceRetainedDiagnostic(
  value: unknown,
  capabilityIds?: ReadonlySet<string>,
  policy?: Readonly<ImportConformanceDiagnosticEvidencePolicy>,
): ImportConformanceRetainedDiagnostic {
  if (!isRecord(value) || typeof value.kind !== 'string' || value.kind === '') {
    throw new Error('invalid retained diagnostic kind');
  }
  expectExactKeys(
    value,
    value.detail === undefined ? ['kind', 'origin', 'severity'] : ['detail', 'kind', 'origin', 'severity'],
    'retained diagnostic',
  );
  if (typeof value.origin !== 'string' || value.origin === '') {
    throw new Error('invalid retained diagnostic origin');
  }
  if (
    value.severity !== 'Drop' &&
    value.severity !== 'Recover' &&
    value.severity !== 'Reject' &&
    value.severity !== 'Skip'
  ) {
    throw new Error('invalid retained diagnostic severity');
  }
  if ((capabilityIds === undefined) !== (policy === undefined)) {
    throw new Error('retained diagnostic policy and capability ids must be supplied together');
  }
  if (policy !== undefined) assertImportConformanceDiagnosticEvidencePolicy(policy);
  const detail = value.detail === undefined ? undefined : parseRetainedDetail(value.detail, capabilityIds, policy);
  return {
    ...(detail === undefined ? {} : { detail }),
    kind: value.kind,
    origin: value.origin,
    severity: value.severity,
  };
}

function retainDecidedDetail(
  detail: Readonly<Record<string, boolean | number | string>> | undefined,
  capabilityIds: ReadonlySet<string>,
  policy: Readonly<ImportConformanceDiagnosticEvidencePolicy>,
): Readonly<Record<string, number | string>> | undefined {
  if (detail === undefined) return undefined;
  const retained: Record<string, number | string> = {};
  assertImportConformanceDiagnosticEvidencePolicy(policy);
  for (const { field, rule } of policy.detail) {
    const value = detail[field];
    if (rule.kind === 'capability-id') {
      if (typeof value === 'string' && capabilityIds.has(value)) retained[field] = value;
    } else if (rule.kind === 'string-enum') {
      if (typeof value === 'string' && rule.values.includes(value)) retained[field] = value;
    } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
      retained[field] = value;
    }
  }
  return Object.keys(retained).length === 0 ? undefined : retained;
}

function parseRetainedDetail(
  value: unknown,
  capabilityIds: ReadonlySet<string> | undefined,
  policy: Readonly<ImportConformanceDiagnosticEvidencePolicy> | undefined,
): Readonly<Record<string, number | string>> {
  if (!isRecord(value) || Object.keys(value).length === 0) throw new Error('invalid retained diagnostic detail');
  const ruleByField = policy === undefined ? null : new Map(policy.detail.map((entry) => [entry.field, entry.rule]));
  const detail: Record<string, number | string> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(key) || (typeof candidate !== 'number' && typeof candidate !== 'string')) {
      throw new Error('retained diagnostic detail contains invalid fields');
    }
    if (typeof candidate === 'number' && !Number.isSafeInteger(candidate)) {
      throw new Error(`invalid retained diagnostic ${key}`);
    }
    const rule = ruleByField?.get(key);
    if (ruleByField !== null && rule === undefined) {
      throw new Error(`retained diagnostic detail contains fields not declared by policy: ${key}`);
    }
    if (
      (rule?.kind === 'capability-id' && (typeof candidate !== 'string' || !capabilityIds!.has(candidate))) ||
      (rule?.kind === 'nonnegative-integer' &&
        (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0)) ||
      (rule?.kind === 'string-enum' && (typeof candidate !== 'string' || !rule.values.includes(candidate)))
    ) {
      throw new Error(`retained diagnostic ${key} violates policy ${policy!.id}`);
    }
    detail[key] = candidate;
  }
  return detail;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertIdentifier(value: string, context: string): void {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value)) throw new Error(`${context} must be a stable identifier`);
}

function expectExactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[], context: string): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${context} must contain exactly ${sortedExpected.join(', ')}`);
  }
}
