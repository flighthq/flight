import type {
  ImportConformanceCapabilityDefinition,
  ImportConformanceInstrumentationProofs,
  ImportConformanceLossPath,
} from './import-conformance-core';

export interface ImportConformanceInstrumentationMapping {
  blockingProblems: string[];
  lossPathByCapability: Map<string, ImportConformanceLossPath>;
  problems: string[];
  proofs: Map<string, ImportConformanceInstrumentationProofs>;
}

export function parseImportConformanceInstrumentationMapping(
  value: unknown,
  definitions: readonly Readonly<ImportConformanceCapabilityDefinition>[],
): ImportConformanceInstrumentationMapping {
  const lossPathByCapability = new Map<string, ImportConformanceLossPath>(
    definitions.map((definition) => [definition.id, { state: 'unaudited' }]),
  );
  if (!isRecord(value) || !Array.isArray(value.capabilities)) {
    return {
      blockingProblems: [],
      lossPathByCapability,
      problems: ['Instrumentation mapping root is invalid'],
      proofs: new Map(),
    };
  }
  const declared = new Set(definitions.map((definition) => definition.id));
  const blockingProblems: string[] = [];
  const problems: string[] = [];
  const proofs = new Map<string, ImportConformanceInstrumentationProofs>();
  const seen = new Set<string>();
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
    if (seen.has(id)) {
      proofs.delete(id);
      lossPathByCapability.set(id, { state: 'unaudited' });
      problems.push(`Instrumentation mapping repeats capability ${id}`);
      continue;
    }
    seen.add(id);
    const audits = parseAudits(candidate.audits);
    const fires = parseProofs(candidate.fires);
    const staysSilent = parseProofs(candidate.staysSilent);
    if (audits === null || fires === null || staysSilent === null || (fires.length === 0 && staysSilent.length === 0)) {
      problems.push(`Instrumentation mapping for ${id} lacks a valid proof role`);
      continue;
    }
    proofs.set(id, { audits, fires, staysSilent });
    if (candidate.lossPath === null) {
      blockingProblems.push(`Instrumentation mapping for ${id} collapses an unknown audit state into null`);
      continue;
    }
    if (isRecord(candidate.lossPath) && candidate.lossPath.state === 'unidentified') {
      blockingProblems.push(`Instrumentation mapping for ${id} has an audit whose identity is unavailable`);
      continue;
    }
    const lossPath = parseLossPath(candidate.lossPath, candidate.lossFamily);
    if (lossPath === null) {
      problems.push(`Instrumentation mapping for ${id} lacks a valid singular loss-path declaration`);
      continue;
    }
    lossPathByCapability.set(id, lossPath);
  }
  invalidateMismatchedProofPopulation(value.fireProven, 'fire', proofs, problems);
  invalidateMismatchedProofPopulation(value.silenceProven, 'silence', proofs, problems);
  invalidateMismatchedLossPathPopulation(value.lossPathIdentified, lossPathByCapability, problems);
  for (const id of proofs.keys()) {
    if (lossPathByCapability.get(id)?.state === 'identified') continue;
    problems.push(`Instrumentation proof for ${id} lacks an identified loss path`);
    proofs.delete(id);
  }
  return { blockingProblems, lossPathByCapability, problems, proofs };
}

function parseAudits(value: unknown): ('payload' | 'scope')[] | null {
  if (!Array.isArray(value) || value.some((audit) => audit !== 'payload' && audit !== 'scope')) return null;
  const audits = value as ('payload' | 'scope')[];
  for (let index = 1; index < audits.length; index++) {
    if (audits[index - 1]! >= audits[index]!) return null;
  }
  return [...audits];
}

function parseLossPath(value: unknown, family: unknown): ImportConformanceLossPath | null {
  if (!isRecord(value)) return null;
  if (value.state === 'unaudited') {
    return family === null && Object.keys(value).sort().join('\0') === 'state' ? { state: 'unaudited' } : null;
  }
  if (
    value.state !== 'identified' ||
    typeof family !== 'string' ||
    family.trim() === '' ||
    Object.keys(value).sort().join('\0') !==
      ['auditId', 'auditedAt', 'auditor', 'family', 'state', 'subjectHash'].sort().join('\0') ||
    value.family !== family
  ) {
    return null;
  }
  if (
    typeof value.auditId !== 'string' ||
    value.auditId.trim() === '' ||
    typeof value.auditor !== 'string' ||
    value.auditor.trim() === '' ||
    typeof value.auditedAt !== 'string' ||
    typeof value.subjectHash !== 'string' ||
    value.subjectHash.trim() === ''
  ) {
    return null;
  }
  const timestamp = Date.parse(value.auditedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.auditedAt) ||
    Number.isNaN(timestamp) ||
    typeof value.family !== 'string'
  ) {
    return null;
  }
  return {
    audit: {
      auditId: value.auditId,
      auditedAt: new Date(timestamp).toISOString(),
      auditor: value.auditor,
      subjectHash: value.subjectHash,
    },
    state: 'identified',
  };
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
    const retained = role === 'fire' ? { ...candidate, fires: [] } : { ...candidate, staysSilent: [] };
    if (retained.fires.length === 0 && retained.staysSilent.length === 0) proofs.delete(id);
    else proofs.set(id, retained);
  }
}

function invalidateMismatchedLossPathPopulation(
  declaredCount: unknown,
  lossPaths: Map<string, ImportConformanceLossPath>,
  problems: string[],
): void {
  const actualCount = [...lossPaths.values()].filter((candidate) => candidate.state !== 'unaudited').length;
  if (Number.isSafeInteger(declaredCount) && declaredCount === actualCount) return;
  problems.push('Instrumentation mapping loss-path-identified count is stale');
  for (const [id, lossPath] of lossPaths) {
    if (lossPath.state !== 'unaudited') lossPaths.set(id, { state: 'unaudited' });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
