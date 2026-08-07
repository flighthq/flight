import type {
  ImportConformanceCapabilityDefinition,
  ImportConformanceInstrumentationProofs,
} from './import-conformance-core';

export interface ImportConformanceInstrumentationMapping {
  problems: string[];
  proofs: Map<string, ImportConformanceInstrumentationProofs>;
}

export function parseImportConformanceInstrumentationMapping(
  value: unknown,
  definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[],
): ImportConformanceInstrumentationMapping {
  if (!isRecord(value) || !Array.isArray(value.capabilities)) {
    return { problems: ['Instrumentation mapping root is invalid'], proofs: new Map() };
  }
  const declared = new Set(definitions.map((definition) => definition.id));
  const problems: string[] = [];
  const proofs = new Map<string, ImportConformanceInstrumentationProofs>();
  const duplicates = new Set<string>();
  if (value.count !== value.capabilities.length) problems.push('Instrumentation mapping count is stale');

  for (const candidate of value.capabilities) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string') {
      problems.push('Instrumentation mapping contains an invalid row');
      continue;
    }
    const { id } = candidate;
    if (!declared.has(id)) {
      problems.push(`Instrumentation mapping names undeclared capability ${id}`);
      continue;
    }
    if (proofs.has(id) || duplicates.has(id)) {
      proofs.delete(id);
      duplicates.add(id);
      problems.push(`Instrumentation mapping repeats capability ${id}`);
      continue;
    }
    const fires = parseProofs(candidate.fires);
    const staysSilent = parseProofs(candidate.staysSilent);
    if (fires === null || staysSilent === null) {
      problems.push(`Instrumentation mapping for ${id} lacks valid firing and silence proofs`);
      continue;
    }
    proofs.set(id, { fires, staysSilent });
  }
  return { problems, proofs };
}

function parseProofs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.some((proof) => typeof proof !== 'string')) return null;
  const proofs = value as string[];
  if (proofs.some((proof) => proof.trim() === '')) return null;
  for (let index = 1; index < proofs.length; index++) {
    if (proofs[index - 1]! >= proofs[index]!) return null;
  }
  return [...proofs];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
