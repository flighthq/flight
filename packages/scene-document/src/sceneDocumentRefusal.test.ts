import { FlightDocumentRefusalReason } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createDocumentRefusal, createSceneRefusal } from './sceneDocumentRefusal';

describe('createDocumentRefusal', () => {
  it('produces a refusal with the given path', () => {
    const refusal = createDocumentRefusal(FlightDocumentRefusalReason.VersionUnsupported, 'version');
    expect(refusal.reason).toBe(FlightDocumentRefusalReason.VersionUnsupported);
    expect(refusal.path).toBe('version');
  });

  it('nulls all optional fields', () => {
    const refusal = createDocumentRefusal(FlightDocumentRefusalReason.StructureInvalid, '');
    expect(refusal.actual).toBeNull();
    expect(refusal.column).toBeNull();
    expect(refusal.kind).toBeNull();
    expect(refusal.limit).toBeNull();
    expect(refusal.line).toBeNull();
    expect(refusal.offset).toBeNull();
    expect(refusal.resourceKey).toBeNull();
    expect(refusal.version).toBeNull();
  });
});

describe('createSceneRefusal', () => {
  it('qualifies path with scene index', () => {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.DuplicateAmbientLight, 0, 'lights');
    expect(refusal.path).toBe('scenes[0].lights');
  });

  it('qualifies with non-zero scene index', () => {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.DuplicateDirectionalLight, 2, 'lights');
    expect(refusal.path).toBe('scenes[2].lights');
  });

  it('omits trailing dot for empty inner path', () => {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, 1, '');
    expect(refusal.path).toBe('scenes[1]');
  });

  it('carries the reason through', () => {
    const refusal = createSceneRefusal(FlightDocumentRefusalReason.StructureInvalid, 0, 'kind');
    expect(refusal.reason).toBe(FlightDocumentRefusalReason.StructureInvalid);
    expect(refusal.path).toBe('scenes[0].kind');
  });
});
