import { createEntity } from '@flighthq/entity/contract';
import { createKeyedTable, getRegistryTableEntry, withRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  FlightDocumentRefusalExplanation,
  FlightDocumentScene,
  FlightDocumentToken,
  FlightDocumentTokenResolution,
  FlightDocumentTokenResolver,
  FlightDocumentTokenResolverRegistry,
  FlightDocumentValue,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import {
  INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE,
  isFlightDocumentTokenReference,
  readFlightDocumentTokenReferenceKey,
  substituteFlightDocumentTokenValue,
} from './flightDocumentTokenReference';

// The value kinds the SDK itself describes. A caller composes vendor kinds onto the returned table
// with withRegistryTableEntry; nothing is registered at module scope, so a caller that never asks for
// the built-ins never pays for them.
export function createFlightDocumentTokenResolverRegistry(): FlightDocumentTokenResolverRegistry {
  let resolvers = createKeyedTable<FlightDocumentTokenResolver>(TOKEN_RESOLVER_REGISTRY_ID, TOKEN_RESOLVER_MISS_POLICY);
  resolvers = withRegistryTableEntry(resolvers, 'Boolean', resolveBooleanTokenValue);
  resolvers = withRegistryTableEntry(resolvers, 'Color', resolveColorTokenValue);
  resolvers = withRegistryTableEntry(resolvers, 'Number', resolveNumberTokenValue);
  resolvers = withRegistryTableEntry(resolvers, 'String', resolveStringTokenValue);
  return createEntity({ resolvers });
}

export function explainFlightDocumentSceneTokenResolution(
  scene: Readonly<FlightDocumentScene>,
  mode: string,
  resolvers?: Readonly<FlightDocumentTokenResolverRegistry>,
): FlightDocumentRefusalExplanation | null {
  return readSceneTokens(scene, mode, resolvers).refusal;
}

export function resolveFlightDocumentSceneTokens(
  scene: Readonly<FlightDocumentScene>,
  mode: string,
  resolvers?: Readonly<FlightDocumentTokenResolverRegistry>,
): FlightDocumentTokenResolution | null {
  return readSceneTokens(scene, mode, resolvers).resolution;
}

// One pass serves both exported seams so a refusal and a null can never disagree about the same input.
function readSceneTokens(
  scene: Readonly<FlightDocumentScene>,
  mode: string,
  resolvers?: Readonly<FlightDocumentTokenResolverRegistry>,
): SceneTokenReadResult {
  const rows = new Map<string, TokenRow>();
  for (let index = 0; index < scene.tokens.length; index++) {
    const token = scene.tokens[index];
    rows.set(token.key, { index, token });
  }
  const state: SceneTokenResolutionState = { mode, resolvers, resolved: new Map(), rows, visiting: new Set() };
  const values: Record<string, FlightDocumentValue> = {};
  for (const token of scene.tokens) {
    const resolved = resolveTokenKey(token.key, state);
    if (resolved === INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE) return { refusal: state.refusal ?? null, resolution: null };
    values[token.key] = resolved;
  }
  return { refusal: null, resolution: { mode, values } };
}

// Resolves one token to its concrete value for the requested mode, following an alias chain through
// the same mode. Memoized so a diamond of aliases costs one resolution per token, and guarded by a
// visiting set so a cycle is named instead of recursing until the stack ends.
function resolveTokenKey(
  key: string,
  state: SceneTokenResolutionState,
  referencedFrom = '',
): FlightDocumentValue | typeof INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE {
  const memo = state.resolved.get(key);
  if (memo !== undefined) return memo;
  const row = state.rows.get(key);
  if (row === undefined) {
    return refuse(state, FlightDocumentRefusalReason.TokenUnresolved, referencedFrom, key, null, null);
  }
  const path = `tokens[${row.index}]`;
  if (state.visiting.has(key)) {
    return refuse(state, FlightDocumentRefusalReason.TokenReferenceCycle, path, key, null, row.token.kind);
  }
  const resolver =
    state.resolvers === undefined ? null : getRegistryTableEntry(state.resolvers.resolvers, row.token.kind);
  if (resolver === null) {
    const kindPath = `${path}.kind`;
    return refuse(state, FlightDocumentRefusalReason.TokenResolverUnregistered, kindPath, key, null, row.token.kind);
  }
  const mode = row.token.values[state.mode] !== undefined ? state.mode : DEFAULT_MODE;
  const authored = row.token.values[mode];
  if (authored === undefined) {
    return refuse(state, FlightDocumentRefusalReason.TokenModeUnresolved, path, key, state.mode, row.token.kind);
  }
  const modePath = `${path}.${mode}`;
  state.visiting.add(key);
  const substituted = isFlightDocumentTokenReference(authored)
    ? resolveAlias(authored, row.token, modePath, state)
    : substituteFlightDocumentTokenValue(
        authored,
        modePath,
        (key, at) => resolveTokenKey(key, state, at),
        (at) => void refuse(state, FlightDocumentRefusalReason.TokenReferenceInvalid, at, null, null, null),
      );
  state.visiting.delete(key);
  if (substituted === INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE) return INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE;
  const value = resolver(substituted, row.token);
  if (value === null) {
    return refuse(state, FlightDocumentRefusalReason.TokenValueInvalid, modePath, key, mode, row.token.kind);
  }
  state.resolved.set(key, value);
  return value;
}

// A whole-value reference is an ALIAS: it names another token of the same semantic type, so the kinds
// must agree. A reference nested inside a composite value is an ordinary value substitution and
// carries no such claim — the field it fills is not the token's own type.
function resolveAlias(
  authored: string,
  token: Readonly<FlightDocumentToken>,
  path: string,
  state: SceneTokenResolutionState,
): FlightDocumentValue | typeof INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE {
  const target = readFlightDocumentTokenReferenceKey(authored);
  if (target === null) {
    return refuse(state, FlightDocumentRefusalReason.TokenReferenceInvalid, path, token.key, null, token.kind);
  }
  const targetRow = state.rows.get(target);
  if (targetRow !== undefined && targetRow.token.kind !== token.kind) {
    const kindPath = `tokens[${targetRow.index}].kind`;
    return refuse(state, FlightDocumentRefusalReason.TokenKindMismatch, kindPath, target, null, targetRow.token.kind);
  }
  return resolveTokenKey(target, state, path);
}

function refuse(
  state: SceneTokenResolutionState,
  reason: FlightDocumentRefusalReason,
  path: string,
  tokenKey: string | null,
  mode: string | null,
  kind: string | null,
): typeof INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE {
  state.refusal ??= createEntity({
    actual: null,
    column: null,
    kind,
    limit: null,
    line: null,
    mode,
    offset: null,
    path,
    reason,
    resourceKey: null,
    tokenKey,
    version: null,
  });
  return INVALID_FLIGHT_DOCUMENT_TOKEN_VALUE;
}

function resolveBooleanTokenValue(value: FlightDocumentValue): FlightDocumentValue | null {
  return typeof value === 'boolean' ? value : null;
}

// Packed sRGB RGBA, matching the SDK-wide colour convention: one unsigned 32-bit integer, never a
// float and never a separate alpha.
function resolveColorTokenValue(value: FlightDocumentValue): FlightDocumentValue | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return value >= 0 && value <= 0xffffffff ? value : null;
}

function resolveNumberTokenValue(value: FlightDocumentValue): FlightDocumentValue | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resolveStringTokenValue(value: FlightDocumentValue): FlightDocumentValue | null {
  return typeof value === 'string' ? value : null;
}

interface SceneTokenReadResult {
  refusal: FlightDocumentRefusalExplanation | null;
  resolution: FlightDocumentTokenResolution | null;
}

interface SceneTokenResolutionState {
  mode: string;
  refusal?: FlightDocumentRefusalExplanation;
  resolved: Map<string, FlightDocumentValue>;
  resolvers?: Readonly<FlightDocumentTokenResolverRegistry>;
  rows: Map<string, TokenRow>;
  visiting: Set<string>;
}

interface TokenRow {
  index: number;
  token: Readonly<FlightDocumentToken>;
}

const DEFAULT_MODE = 'default';
// A miss is a named refusal, never a substituted value: an unregistered kind must not resolve.
const TOKEN_RESOLVER_MISS_POLICY = 'Unregistered';
const TOKEN_RESOLVER_REGISTRY_ID = 'flight-document-token-resolvers';
