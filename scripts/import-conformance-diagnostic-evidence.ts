import type { ImportDiagnostic } from '@flighthq/types/contract';

export interface ImportConformanceRetainedDiagnostic {
  detail?: Readonly<Record<string, number | string>>;
  kind: string;
  origin: string;
  severity: ImportDiagnostic['severity'];
}

/**
 * Retain only fields whose licence treatment has been decided. Diagnostic kind, origin, and severity are
 * Flight-owned vocabulary. Capability and compression are Flight-owned tags; the four numeric fields are
 * counts or indices. Fixture-derived names/text and every future detail field stay absent until explicitly ruled in.
 */
export function retainImportConformanceDiagnostic(
  diagnostic: Readonly<ImportDiagnostic>,
  capabilityIds: ReadonlySet<string>,
): ImportConformanceRetainedDiagnostic {
  const detail = retainDecidedDetail(diagnostic.detail, capabilityIds);
  return {
    ...(detail === undefined ? {} : { detail }),
    kind: diagnostic.kind,
    origin: diagnostic.origin,
    severity: diagnostic.severity,
  };
}

function retainDecidedDetail(
  detail: Readonly<Record<string, boolean | number | string>> | undefined,
  capabilityIds: ReadonlySet<string>,
): Readonly<Record<string, number | string>> | undefined {
  if (detail === undefined) return undefined;
  const retained: Record<string, number | string> = {};
  const capability = detail.capability;
  if (typeof capability === 'string' && capabilityIds.has(capability)) retained.capability = capability;
  const compression = detail.compression;
  if (compression === 'deflate' || compression === 'lzma') retained.compression = compression;
  retainNonnegativeInteger(detail, retained, 'characterId');
  retainNonnegativeInteger(detail, retained, 'frame');
  retainNonnegativeInteger(detail, retained, 'length');
  retainNonnegativeInteger(detail, retained, 'sceneCount');
  return Object.keys(retained).length === 0 ? undefined : retained;
}

function retainNonnegativeInteger(
  source: Readonly<Record<string, boolean | number | string>>,
  target: Record<string, number | string>,
  key: 'characterId' | 'frame' | 'length' | 'sceneCount',
): void {
  const value = source[key];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) target[key] = value;
}
