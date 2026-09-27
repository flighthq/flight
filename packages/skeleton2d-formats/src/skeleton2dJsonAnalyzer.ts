import type { Skeleton2DJsonAnalysis } from '@flighthq/types/contract';

interface Skeleton2DJsonAnalyzerEntry {
  census: (record: Readonly<Record<string, unknown>>) => Map<string, number>;
  detect: (record: Readonly<Record<string, unknown>>) => boolean;
  format: string;
  order: number;
}

export function analyzeSkeleton2DJson(json: string): Skeleton2DJsonAnalysis | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  for (const entry of getAnalyzersInOrder()) {
    if (entry.detect(record)) {
      return { counts: entry.census(record), format: entry.format };
    }
  }
  return null;
}

export function registerSkeleton2DJsonAnalyzer(
  format: string,
  detect: (record: Readonly<Record<string, unknown>>) => boolean,
  census: (record: Readonly<Record<string, unknown>>) => Map<string, number>,
): void {
  const existing = _analyzers.findIndex((entry) => entry.format === format);
  const entry: Skeleton2DJsonAnalyzerEntry = {
    census,
    detect,
    format,
    order: existing >= 0 ? _analyzers[existing].order : _nextOrder++,
  };
  if (existing >= 0) _analyzers[existing] = entry;
  else _analyzers.push(entry);
}

export function unregisterSkeleton2DJsonAnalyzer(format: string): boolean {
  const index = _analyzers.findIndex((entry) => entry.format === format);
  if (index === -1) return false;
  _analyzers.splice(index, 1);
  return true;
}

function getAnalyzersInOrder(): readonly Skeleton2DJsonAnalyzerEntry[] {
  if (_analyzers.length === 0) registerBuiltInAnalyzers();
  return _analyzers;
}

function registerBuiltInAnalyzers(): void {
  registerSkeleton2DJsonAnalyzer('spine-json', isSpineJson, censusSpineJson);
  registerSkeleton2DJsonAnalyzer('dragonbones', isDragonBones, censusDragonBones);
}

function isSpineJson(record: Readonly<Record<string, unknown>>): boolean {
  return (
    (Array.isArray(record.bones) || (record.skeleton !== null && typeof record.skeleton === 'object')) &&
    !Array.isArray(record.armature)
  );
}

function isDragonBones(record: Readonly<Record<string, unknown>>): boolean {
  return Array.isArray(record.armature);
}

function censusSpineJson(record: Readonly<Record<string, unknown>>): Map<string, number> {
  const counts = new Map<string, number>();
  countArrayOrObject(counts, record, 'bones', 'bones');
  countArrayOrObject(counts, record, 'slots', 'slots');
  countArrayOrObject(counts, record, 'skins', 'skins');
  countArrayOrObject(counts, record, 'events', 'events');
  countArrayOrObject(counts, record, 'ik', 'ikConstraints');
  countArrayOrObject(counts, record, 'path', 'pathConstraints');
  countArrayOrObject(counts, record, 'transform', 'transformConstraints');
  if (record.animations !== null && typeof record.animations === 'object') {
    const keys = Object.keys(record.animations as Record<string, unknown>);
    if (keys.length > 0) counts.set('animations', keys.length);
  }
  return counts;
}

function censusDragonBones(record: Readonly<Record<string, unknown>>): Map<string, number> {
  const counts = new Map<string, number>();
  const armatures = record.armature as unknown[];
  if (armatures.length === 0) return counts;
  const first = armatures[0];
  if (first === null || typeof first !== 'object') return counts;
  const armature = first as Record<string, unknown>;
  countArray(counts, armature, 'bone', 'bones');
  countArray(counts, armature, 'slot', 'slots');
  countArray(counts, armature, 'skin', 'skins');
  countArray(counts, armature, 'ik', 'ikConstraints');
  countArray(counts, armature, 'animation', 'animations');
  return counts;
}

function countArrayOrObject(
  counts: Map<string, number>,
  record: Readonly<Record<string, unknown>>,
  jsonKey: string,
  kind: string,
): void {
  const value = record[jsonKey];
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    if (value.length > 0) counts.set(kind, value.length);
  } else if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length > 0) counts.set(kind, keys.length);
  }
}

function countArray(
  counts: Map<string, number>,
  record: Readonly<Record<string, unknown>>,
  jsonKey: string,
  kind: string,
): void {
  const value = record[jsonKey];
  if (!Array.isArray(value) || value.length === 0) return;
  counts.set(kind, value.length);
}

const _analyzers: Skeleton2DJsonAnalyzerEntry[] = [];
let _nextOrder = 0;
