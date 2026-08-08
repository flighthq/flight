import type { ImportConformanceDiagnosticEvidencePolicy } from '../core/import-conformance-diagnostic-evidence';

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
