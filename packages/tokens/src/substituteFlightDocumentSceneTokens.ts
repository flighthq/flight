import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  FlightDocumentFields,
  FlightDocumentNode,
  FlightDocumentRefusalExplanation,
  FlightDocumentScene,
  FlightDocumentTokenResolution,
  FlightDocumentValue,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import {
  INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE,
  substituteFlightDocumentTokenValue,
} from './flightDocumentTokenReference';

export function explainFlightDocumentSceneTokenSubstitution(
  scene: Readonly<FlightDocumentScene>,
  resolution: Readonly<FlightDocumentTokenResolution>,
): FlightDocumentRefusalExplanation | null {
  return readSubstitution(scene, resolution).refusal;
}

// Pure: the input scene is never touched and a new entry is returned for later materialization. The
// dimension is preserved through the type parameter so a caller does not re-narrow what it passed in.
// The readonly intent sits on the CONSTRAINT rather than on the parameter: Readonly<T> is homomorphic
// and distributes, so a caller holding the FlightDocumentScene union — which is what document.scenes[i]
// is — could not have inferred T at all.
export function substituteFlightDocumentSceneTokens<T extends Readonly<FlightDocumentScene>>(
  scene: T,
  resolution: Readonly<FlightDocumentTokenResolution>,
): T | null {
  const substituted = readSubstitution(scene, resolution);
  if (substituted.scene === null) return null;
  // The spread carries every scene-level section (layouts and tokens, plus backgroundColor or cameras
  // and lights) unchanged, and only `scene` is replaced; T is preserved by construction rather than by
  // narrowing, which no assertion in the language can express for a generic spread.
  return { ...scene, scene: substituted.scene } as T;
}

function readSubstitution(
  scene: Readonly<FlightDocumentScene>,
  resolution: Readonly<FlightDocumentTokenResolution>,
): SceneSubstitutionResult {
  const state: SceneSubstitutionState = { resolution };
  const root = substituteNode(scene.scene, 'scene', state);
  if (root === null) return { refusal: state.refusal ?? null, scene: null };
  return { refusal: null, scene: root };
}

function substituteNode(
  node: Readonly<FlightDocumentNode>,
  path: string,
  state: SceneSubstitutionState,
): FlightDocumentNode | null {
  const fields: FlightDocumentFields = {};
  for (const name of Object.keys(node.fields)) {
    const fieldPath = `${path}.fields.${name}`;
    const value = substituteFlightDocumentTokenValue(
      node.fields[name],
      fieldPath,
      (key, at) => lookup(key, at, state),
      (at) => refuse(state, FlightDocumentRefusalReason.TokenReferenceInvalid, at, null),
    );
    if (value === INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE) return null;
    fields[name] = value;
  }
  const children: FlightDocumentNode[] = [];
  for (let index = 0; index < node.children.length; index++) {
    const child = substituteNode(node.children[index], `${path}.children[${index}]`, state);
    if (child === null) return null;
    children.push(child);
  }
  return { children, fields, kind: node.kind };
}

// A reference the resolution does not cover is a named refusal, never a `$…` string left in a field a
// renderer will read as a number. Silent pass-through would make the file say one thing and the render
// show another, with nothing reporting the difference.
function lookup(
  key: string,
  path: string,
  state: SceneSubstitutionState,
): FlightDocumentValue | typeof INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE {
  const value = state.resolution.values[key];
  if (value === undefined) {
    refuse(state, FlightDocumentRefusalReason.TokenUnresolved, path, key);
    return INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE;
  }
  return value;
}

function refuse(
  state: SceneSubstitutionState,
  reason: FlightDocumentRefusalReason,
  path: string,
  tokenKey: string | null,
): void {
  state.refusal ??= (() => {
    const out = allocateEntity<unknown>();
    out.actual = null;
    out.column = null;
    out.kind = null;
    out.limit = null;
    out.line = null;
    out.mode = state.resolution.mode;
    out.offset = null;
    out.path = path;
    out.reason = reason;
    out.resourceKey = null;
    out.tokenKey = tokenKey;
    out.version = null;
    return finishEntity(out);
  })();
}

interface SceneSubstitutionResult {
  refusal: FlightDocumentRefusalExplanation | null;
  scene: FlightDocumentNode | null;
}

interface SceneSubstitutionState {
  refusal?: FlightDocumentRefusalExplanation;
  resolution: Readonly<FlightDocumentTokenResolution>;
}
