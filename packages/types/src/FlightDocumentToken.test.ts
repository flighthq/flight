import type { FlightDocument } from './FlightDocument';
import type {
  FlightDocumentToken,
  FlightDocumentTokenResolution,
  FlightDocumentTokenResolver,
} from './FlightDocumentToken';

describe('FlightDocumentToken', () => {
  it('carries the kind on the row so every mode variant shares one semantic type', () => {
    const token: FlightDocumentToken = {
      key: 'color.background',
      kind: 'Color',
      values: { dark: 0x1a1a1aff, light: 0xffffffff },
    };
    expect(token.kind).toBe('Color');
    expect(Object.keys(token.values).sort()).toEqual(['dark', 'light']);
  });

  it('declares tokens on each scene entry rather than on the container', () => {
    const document: FlightDocument = {
      defaultScene: 0,
      resources: [],
      scenes: [
        {
          backgroundColor: null,
          kind: 'Scene2D',
          layouts: [],
          scene: { children: [], fields: {}, kind: 'DisplayObject' },
          tokens: [{ key: 'color.primary', kind: 'Color', values: { default: 0x3366ccff } }],
        },
        {
          cameras: [],
          kind: 'Scene3D',
          layouts: [],
          lights: [],
          scene: { children: [], fields: {}, kind: 'Node3D' },
          tokens: [],
        },
      ],
      version: 1,
    };
    expect(document.scenes[0].tokens).toHaveLength(1);
    expect(document.scenes[1]?.tokens).toHaveLength(0);
  });

  it('resolves one mode to a dereferenced table', () => {
    const resolution: FlightDocumentTokenResolution = {
      mode: 'dark',
      values: { 'color.background': 0x1a1a1aff },
    };
    expect(resolution.values['color.background']).toBe(0x1a1a1aff);
  });

  it('refuses an inadmissible value through a null-returning per-kind resolver', () => {
    const resolveColor: FlightDocumentTokenResolver = (value) =>
      typeof value === 'number' && Number.isInteger(value) ? value : null;
    const token: FlightDocumentToken = { key: 'color.primary', kind: 'Color', values: {} };
    expect(resolveColor(0x3366ccff, token)).toBe(0x3366ccff);
    expect(resolveColor('blue', token)).toBeNull();
  });
});
