import type {
  ImportConformanceCapabilityDefinition,
  ImportConformanceInstrumentationProofs,
} from './import-conformance-core';

export interface ImportConformanceInstrumentationMapping {
  lossPathIdentifiedByCapability: Map<string, boolean>;
  problems: string[];
  proofs: Map<string, ImportConformanceInstrumentationProofs>;
}

export function parseImportConformanceInstrumentationMapping(
  value: unknown,
  definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[],
): ImportConformanceInstrumentationMapping {
  if (!isRecord(value) || !Array.isArray(value.capabilities)) {
    return {
      lossPathIdentifiedByCapability: new Map(),
      problems: ['Instrumentation mapping root is invalid'],
      proofs: new Map(),
    };
  }
  const declared = new Set(definitions.map((definition) => definition.id));
  const problems: string[] = [];
  const lossPathIdentifiedByCapability = parseLossPathStates(value.lossPaths, definitions, problems);
  const proofs = new Map<string, ImportConformanceInstrumentationProofs>();
  const duplicates = new Set<string>();
  let previousId = '';

  for (const candidate of value.capabilities) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string') {
      problems.push('Instrumentation mapping contains an invalid row');
      continue;
    }
    const { id } = candidate;
    if (id <= previousId) problems.push('Instrumentation mapping capability ids are not sorted and unique');
    previousId = id;
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
    if (fires === null || staysSilent === null || (fires.length === 0 && staysSilent.length === 0)) {
      problems.push(`Instrumentation mapping for ${id} lacks a valid proof role`);
      continue;
    }
    proofs.set(id, { fires, staysSilent });
  }
  invalidateMismatchedProofPopulation(value.fireProven, 'fire', proofs, problems);
  invalidateMismatchedProofPopulation(value.silenceProven, 'silence', proofs, problems);
  for (const id of proofs.keys()) {
    if (lossPathIdentifiedByCapability.get(id) === true) continue;
    problems.push(`Instrumentation proof for ${id} lacks an identified loss path`);
    lossPathIdentifiedByCapability.delete(id);
  }
  return { lossPathIdentifiedByCapability, problems, proofs };
}

function parseLossPathStates(
  value: unknown,
  definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[],
  problems: string[],
): Map<string, boolean> {
  if (!Array.isArray(value)) {
    problems.push('Instrumentation mapping lacks exhaustive loss-path declarations');
    return new Map();
  }
  const declared = new Set(definitions.map((definition) => definition.id));
  const states = new Map<string, boolean>();
  let invalid = false;
  let previousId = '';
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      (candidate.state !== 'identified' && candidate.state !== 'not-identified')
    ) {
      invalid = true;
      continue;
    }
    if (candidate.id <= previousId || !declared.has(candidate.id)) invalid = true;
    previousId = candidate.id;
    states.set(candidate.id, candidate.state === 'identified');
  }
  if (invalid || states.size !== definitions.length || definitions.some((definition) => !states.has(definition.id))) {
    problems.push('Instrumentation loss-path declarations are not sorted, unique, and exhaustive');
    return new Map();
  }
  return states;
}

function parseProofs(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((proof) => typeof proof !== 'string')) return null;
  const proofs = value as string[];
  if (proofs.some((proof) => proof.trim() === '')) return null;
  for (let index = 1; index < proofs.length; index++) {
    if (proofs[index - 1]! >= proofs[index]!) return null;
  }
  return [...proofs];
}

function invalidateMismatchedProofPopulation(
  declaredCount: unknown,
  role: 'fire' | 'silence',
  proofs: Map<string, ImportConformanceInstrumentationProofs>,
  problems: string[],
): void {
  const key = role === 'fire' ? 'fires' : 'staysSilent';
  const actualCount = [...proofs.values()].filter((candidate) => candidate[key].length > 0).length;
  if (Number.isSafeInteger(declaredCount) && declaredCount === actualCount) return;
  problems.push(`Instrumentation mapping ${role}-proven count is stale`);
  for (const [id, candidate] of proofs) {
    if (candidate[key].length === 0) continue;
    const retained =
      role === 'fire' ? { fires: [], staysSilent: candidate.staysSilent } : { fires: candidate.fires, staysSilent: [] };
    if (retained.fires.length === 0 && retained.staysSilent.length === 0) proofs.delete(id);
    else proofs.set(id, retained);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
