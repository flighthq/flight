import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { withRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  FlightDocumentScene2D,
  FlightDocumentToken,
  FlightDocumentTokenResolverRegistry,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import {
  createFlightDocumentTokenResolverRegistry,
  explainFlightDocumentSceneTokenResolution,
  initializeFlightDocumentTokenResolverRegistry,
  resolveFlightDocumentSceneTokens,
} from './flightDocumentSceneTokens';

describe('createFlightDocumentTokenResolverRegistry', () => {
  it('admits each built-in kind only for the values that kind describes', () => {
    const registry = createFlightDocumentTokenResolverRegistry();
    expect(resolveOne(registry, token('Color', { default: 0x3366ccff }))).toEqual({ 'a.token': 0x3366ccff });
    expect(resolveOne(registry, token('Color', { default: -1 }))).toBeNull();
    expect(resolveOne(registry, token('Color', { default: 1.5 }))).toBeNull();
    expect(resolveOne(registry, token('Color', { default: 0x1_0000_0000 }))).toBeNull();
    expect(resolveOne(registry, token('Color', { default: 'blue' }))).toBeNull();
    expect(resolveOne(registry, token('Number', { default: 1.5 }))).toEqual({ 'a.token': 1.5 });
    expect(resolveOne(registry, token('Number', { default: 'wide' }))).toBeNull();
    expect(resolveOne(registry, token('Boolean', { default: true }))).toEqual({ 'a.token': true });
    expect(resolveOne(registry, token('Boolean', { default: 1 }))).toBeNull();
    expect(resolveOne(registry, token('String', { default: 'Inter' }))).toEqual({ 'a.token': 'Inter' });
    expect(resolveOne(registry, token('String', { default: 12 }))).toBeNull();
  });

  it('stays open to a vendor kind the SDK never registered', () => {
    const registry = createFlightDocumentTokenResolverRegistry();
    const extended = allocateEntity<FlightDocumentTokenResolverRegistry>();
    extended.resolvers = withResolver(registry, 'acme.Duration', (value) => (typeof value === 'number' ? value : null));
    expect(resolveOne(extended, token('acme.Duration', { default: 150 }))).toEqual({ 'a.token': 150 });
  });
});

describe('explainFlightDocumentSceneTokenResolution', () => {
  it('names an unregistered kind against the token that carries it', () => {
    const scene = sceneWith([token('acme.Shadow', { default: 1 })]);
    const explanation = explainFlightDocumentSceneTokenResolution(
      scene,
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenResolverUnregistered);
    expect(explanation?.kind).toBe('acme.Shadow');
    expect(explanation?.tokenKey).toBe('a.token');
    expect(explanation?.path).toBe('tokens[0].kind');
  });

  it('names a value the kind refused, with the mode it was authored under', () => {
    const scene = sceneWith([token('Color', { dark: 'midnight' })]);
    const explanation = explainFlightDocumentSceneTokenResolution(
      scene,
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenValueInvalid);
    expect(explanation?.mode).toBe('dark');
    expect(explanation?.path).toBe('tokens[0].dark');
  });

  it('names a token that declares neither the requested mode nor a default', () => {
    const scene = sceneWith([token('Color', { light: 0xffffffff })]);
    const explanation = explainFlightDocumentSceneTokenResolution(
      scene,
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenModeUnresolved);
    expect(explanation?.mode).toBe('dark');
    expect(explanation?.tokenKey).toBe('a.token');
  });

  it('names an alias whose target no token declares', () => {
    const scene = sceneWith([{ key: 'color.card', kind: 'Color', values: { default: '$color.absent' } }]);
    const explanation = explainFlightDocumentSceneTokenResolution(
      scene,
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenUnresolved);
    expect(explanation?.tokenKey).toBe('color.absent');
  });

  it('names an alias cycle instead of following it forever', () => {
    const scene = sceneWith([
      { key: 'a', kind: 'Color', values: { default: '$b' } },
      { key: 'b', kind: 'Color', values: { default: '$a' } },
    ]);
    const explanation = explainFlightDocumentSceneTokenResolution(
      scene,
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenReferenceCycle);
  });

  it('names a self-referential token as a cycle', () => {
    const scene = sceneWith([{ key: 'a', kind: 'Color', values: { default: '$a' } }]);
    const explanation = explainFlightDocumentSceneTokenResolution(
      scene,
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenReferenceCycle);
    expect(explanation?.tokenKey).toBe('a');
  });

  it('names an alias whose target is a different kind', () => {
    const scene = sceneWith([
      { key: 'color.card', kind: 'Color', values: { default: '$space.gutter' } },
      { key: 'space.gutter', kind: 'Number', values: { default: 8 } },
    ]);
    const explanation = explainFlightDocumentSceneTokenResolution(
      scene,
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenKindMismatch);
    expect(explanation?.tokenKey).toBe('space.gutter');
  });

  it('names a malformed reference rather than treating it as an ordinary string', () => {
    const scene = sceneWith([{ key: 'a', kind: 'String', values: { default: '$9lives' } }]);
    const explanation = explainFlightDocumentSceneTokenResolution(
      scene,
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(explanation?.reason).toBe(FlightDocumentRefusalReason.TokenReferenceInvalid);
  });

  it('reports nothing when every token resolves', () => {
    const scene = sceneWith([token('Color', { default: 0x3366ccff })]);
    expect(
      explainFlightDocumentSceneTokenResolution(scene, 'dark', createFlightDocumentTokenResolverRegistry()),
    ).toBeNull();
  });
});

describe('initializeFlightDocumentTokenResolverRegistry', () => {
  it('is the construction initializer of createFlightDocumentTokenResolverRegistry', () => {
    expect(typeof initializeFlightDocumentTokenResolverRegistry).toBe('function');
  });
});

function resolveOne(
  registry: Readonly<FlightDocumentTokenResolverRegistry>,
  entry: FlightDocumentToken,
): Record<string, unknown> | null {
  const resolution = resolveFlightDocumentSceneTokens(sceneWith([entry]), 'dark', registry);
  return resolution === null ? null : { ...resolution.values };
}

function sceneWith(tokens: readonly FlightDocumentToken[]): FlightDocumentScene2D {
  return {
    backgroundColor: null,
    kind: 'Scene2D',
    layouts: [],
    scene: { children: [], fields: {}, kind: 'DisplayObject' },
    tokens: [...tokens],
  };
}

function token(kind: string, values: FlightDocumentToken['values']): FlightDocumentToken {
  return { key: 'a.token', kind, values };
}

function withResolver(
  registry: Readonly<FlightDocumentTokenResolverRegistry>,
  kind: string,
  resolver: (value: unknown) => unknown,
): FlightDocumentTokenResolverRegistry['resolvers'] {
  return withRegistryTableEntry(registry.resolvers, kind, resolver as never);
}
describe('resolveFlightDocumentSceneTokens', () => {
  it('prefers the requested mode over the default', () => {
    const scene = sceneWith([token('Color', { dark: 0x1a1a1aff, default: 0x808080ff, light: 0xffffffff })]);
    const resolution = resolveFlightDocumentSceneTokens(scene, 'dark', createFlightDocumentTokenResolverRegistry());
    expect(resolution).toEqual({ mode: 'dark', values: { 'a.token': 0x1a1a1aff } });
  });

  it('falls back to the default mode when the requested one is absent', () => {
    const scene = sceneWith([token('Color', { default: 0x808080ff, light: 0xffffffff })]);
    const resolution = resolveFlightDocumentSceneTokens(scene, 'dark', createFlightDocumentTokenResolverRegistry());
    expect(resolution?.values).toEqual({ 'a.token': 0x808080ff });
  });

  it('resolves an alias inside the requested mode rather than through the target default', () => {
    const scene = sceneWith([
      { key: 'color.card', kind: 'Color', values: { default: '$color.background' } },
      { key: 'color.background', kind: 'Color', values: { dark: 0x1a1a1aff, light: 0xffffffff } },
    ]);
    const resolution = resolveFlightDocumentSceneTokens(scene, 'dark', createFlightDocumentTokenResolverRegistry());
    expect(resolution?.values['color.card']).toBe(0x1a1a1aff);
    expect(
      resolveFlightDocumentSceneTokens(scene, 'light', createFlightDocumentTokenResolverRegistry())?.values[
        'color.card'
      ],
    ).toBe(0xffffffff);
  });

  it('follows an alias chain to its concrete value', () => {
    const scene = sceneWith([
      { key: 'a', kind: 'Color', values: { default: '$b' } },
      { key: 'b', kind: 'Color', values: { default: '$c' } },
      { key: 'c', kind: 'Color', values: { default: 0x3366ccff } },
    ]);
    const resolution = resolveFlightDocumentSceneTokens(scene, 'dark', createFlightDocumentTokenResolverRegistry());
    expect(resolution?.values).toEqual({ a: 0x3366ccff, b: 0x3366ccff, c: 0x3366ccff });
  });

  it('resolves an escaped literal dollar sign instead of looking it up', () => {
    const scene = sceneWith([{ key: 'price.label', kind: 'String', values: { default: '$$5.00' } }]);
    const resolution = resolveFlightDocumentSceneTokens(scene, 'dark', createFlightDocumentTokenResolverRegistry());
    expect(resolution?.values['price.label']).toBe('$5.00');
  });

  it('resolves an empty token section to an empty table rather than refusing', () => {
    const resolution = resolveFlightDocumentSceneTokens(
      sceneWith([]),
      'dark',
      createFlightDocumentTokenResolverRegistry(),
    );
    expect(resolution).toEqual({ mode: 'dark', values: {} });
  });

  it('returns null wherever the explain seam reports a refusal', () => {
    const scene = sceneWith([token('Color', { dark: 'midnight' })]);
    expect(resolveFlightDocumentSceneTokens(scene, 'dark', createFlightDocumentTokenResolverRegistry())).toBeNull();
  });

  it('refuses every kind when no resolver registry is supplied', () => {
    expect(resolveFlightDocumentSceneTokens(sceneWith([token('Color', { default: 1 })]), 'dark')).toBeNull();
  });
});
