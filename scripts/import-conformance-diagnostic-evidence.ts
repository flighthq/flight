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
  | { kind: 'string-enum'; values: ReadonlySet<string> };

export interface ImportConformanceDiagnosticEvidencePolicy {
  detail: Readonly<Record<string, ImportConformanceDiagnosticDetailRule>>;
}

export const SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY: ImportConformanceDiagnosticEvidencePolicy = {
  detail: {
    capability: { kind: 'capability-id' },
    characterId: { kind: 'nonnegative-integer' },
    compression: { kind: 'string-enum', values: new Set(['deflate', 'lzma']) },
    frame: { kind: 'nonnegative-integer' },
    length: { kind: 'nonnegative-integer' },
    sceneCount: { kind: 'nonnegative-integer' },
  },
};

/**
 * Retain only fields whose licence treatment has been decided. Diagnostic kind, origin, and severity are
 * Flight-owned vocabulary. Capability and compression are Flight-owned tags; the four numeric fields are
 * counts or indices. Fixture-derived names/text and every future detail field stay absent until explicitly ruled in.
 */
export function retainImportConformanceDiagnostic(
  diagnostic: Readonly<ImportDiagnostic>,
  capabilityIds: ReadonlySet<string>,
  policy: Readonly<ImportConformanceDiagnosticEvidencePolicy> = SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
): ImportConformanceRetainedDiagnostic {
  const detail = retainDecidedDetail(diagnostic.detail, capabilityIds, policy);
  return {
    ...(detail === undefined ? {} : { detail }),
    kind: diagnostic.kind,
    origin: diagnostic.origin,
    severity: diagnostic.severity,
  };
}

export function parseImportConformanceRetainedDiagnostic(value: unknown): ImportConformanceRetainedDiagnostic {
  if (!isRecord(value) || typeof value.kind !== 'string' || value.kind === '') {
    throw new Error('invalid retained diagnostic kind');
  }
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
  const detail = value.detail === undefined ? undefined : parseRetainedDetail(value.detail);
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
  for (const [key, rule] of Object.entries(policy.detail)) {
    const value = detail[key];
    if (rule.kind === 'capability-id') {
      if (typeof value === 'string' && capabilityIds.has(value)) retained[key] = value;
    } else if (rule.kind === 'string-enum') {
      if (typeof value === 'string' && rule.values.has(value)) retained[key] = value;
    } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
      retained[key] = value;
    }
  }
  return Object.keys(retained).length === 0 ? undefined : retained;
}

function parseRetainedDetail(value: unknown): Readonly<Record<string, number | string>> {
  if (!isRecord(value) || Object.keys(value).length === 0) throw new Error('invalid retained diagnostic detail');
  const detail: Record<string, number | string> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(key) || (typeof candidate !== 'number' && typeof candidate !== 'string')) {
      throw new Error('retained diagnostic detail contains invalid fields');
    }
    if (typeof candidate === 'number' && !Number.isSafeInteger(candidate)) {
      throw new Error(`invalid retained diagnostic ${key}`);
    }
    detail[key] = candidate;
  }
  return detail;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
