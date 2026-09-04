import {
  createWgpuCanvasElement,
  createWgpuRenderSurface,
  getWgpuRenderSurfaceProvider,
  resetWgpuRenderSurfaceProviderForTest,
  setWgpuRenderSurfaceProvider,
} from './wgpuElement';

function entityProvider(fields: Omit<WgpuRenderSurfaceProvider, keyof Entity>): WgpuRenderSurfaceProvider {
  return (() => { const out = allocateEntity<unknown>(); Object.assign(out, fields); return finishEntity(out); })();
}

describe('createWgpuCanvasElement', () => {
  afterEach(() => resetWgpuRenderSurfaceProviderForTest());

  it('preserves the canonical provider result identity', () => {
    const surface = {} as HTMLCanvasElement;
    setWgpuRenderSurfaceProvider(entityProvider({ createRenderSurface: () => surface }));
    expect(createWgpuCanvasElement(100, 200, 2)).toBe(surface);
  });

  it('throws an actionable Web-only setup error when the provider is absent', () => {
    expect(() => createWgpuCanvasElement(100, 200)).toThrowError(
      /enableHostWebWgpuRenderSurface\(\).*inject a WgpuRenderSurfaceProvider/,
    );
  });

  it('throws the same setup error when the provider refuses', () => {
    setWgpuRenderSurfaceProvider(entityProvider({ createRenderSurface: () => null }));
    expect(() => createWgpuCanvasElement(100, 200)).toThrowError(/enableHostWebWgpuRenderSurface\(\)/);
  });
});

describe('createWgpuRenderSurface', () => {
  afterEach(() => resetWgpuRenderSurfaceProviderForTest());

  it('returns null when no provider is selected', () => {
    expect(createWgpuRenderSurface(100, 200)).toBeNull();
  });

  it('passes exact dimensions and the default pixel ratio to the selected provider', () => {
    const surface = {} as HTMLCanvasElement;
    const createRenderSurface = vi.fn(() => surface);
    setWgpuRenderSurfaceProvider(entityProvider({ createRenderSurface }));
    expect(createWgpuRenderSurface(100, 200)).toBe(surface);
    expect(createRenderSurface).toHaveBeenCalledOnce();
    expect(createRenderSurface).toHaveBeenCalledWith(100, 200, 1);
  });

  it('passes an explicit pixel ratio and preserves the provider result identity', () => {
    const surface = {} as HTMLCanvasElement;
    const createRenderSurface = vi.fn(() => surface);
    setWgpuRenderSurfaceProvider(entityProvider({ createRenderSurface }));
    expect(createWgpuRenderSurface(300, 150, 2.5)).toBe(surface);
    expect(createRenderSurface).toHaveBeenCalledWith(300, 150, 2.5);
  });

  it('selects replacements and reset restores omission', () => {
    const first = {} as HTMLCanvasElement;
    const second = {} as HTMLCanvasElement;
    const firstProvider = entityProvider({ createRenderSurface: vi.fn(() => first) });
    const secondProvider = entityProvider({ createRenderSurface: vi.fn(() => second) });
    setWgpuRenderSurfaceProvider(firstProvider);
    expect(getWgpuRenderSurfaceProvider()).toBe(firstProvider);
    expect(createWgpuRenderSurface(1, 2)).toBe(first);
    setWgpuRenderSurfaceProvider(secondProvider);
    expect(getWgpuRenderSurfaceProvider()).toBe(secondProvider);
    expect(createWgpuRenderSurface(3, 4)).toBe(second);
    resetWgpuRenderSurfaceProviderForTest();
    expect(getWgpuRenderSurfaceProvider()).toBeNull();
    expect(createWgpuRenderSurface(5, 6)).toBeNull();
  });

  it('preserves provider refusal as null', () => {
    setWgpuRenderSurfaceProvider(entityProvider({ createRenderSurface: () => null }));
    expect(createWgpuRenderSurface(100, 200)).toBeNull();
  });

  it('lets a native host provide a surface without reading document', () => {
    const surface = {} as HTMLCanvasElement;
    setWgpuRenderSurfaceProvider(entityProvider({ createRenderSurface: () => surface }));
    withThrowingDocument(() => expect(createWgpuRenderSurface(100, 200)).toBe(surface));
  });

  it('returns null for omission and refusal without reading document', () => {
    withThrowingDocument(() => {
      expect(createWgpuRenderSurface(100, 200)).toBeNull();
      setWgpuRenderSurfaceProvider(entityProvider({ createRenderSurface: () => null }));
      expect(createWgpuRenderSurface(100, 200)).toBeNull();
    });
  });
});

describe('getWgpuRenderSurfaceProvider', () => {
  afterEach(() => resetWgpuRenderSurfaceProviderForTest());

  it('returns the exact selected provider', () => {
    const provider = entityProvider({ createRenderSurface: () => ({}) as HTMLCanvasElement });
    setWgpuRenderSurfaceProvider(provider);
    expect(getWgpuRenderSurfaceProvider()).toBe(provider);
  });
});

describe('resetWgpuRenderSurfaceProviderForTest', () => {
  it('restores provider omission', () => {
    setWgpuRenderSurfaceProvider(entityProvider({ createRenderSurface: () => ({}) as HTMLCanvasElement }));
    resetWgpuRenderSurfaceProviderForTest();
    expect(getWgpuRenderSurfaceProvider()).toBeNull();
    expect(createWgpuRenderSurface(1, 1)).toBeNull();
  });
});

describe('setWgpuRenderSurfaceProvider', () => {
  afterEach(() => resetWgpuRenderSurfaceProviderForTest());

  it('replaces the selected provider', () => {
    const first = entityProvider({ createRenderSurface: () => ({}) as HTMLCanvasElement });
    const second = entityProvider({ createRenderSurface: () => ({}) as HTMLCanvasElement });
    setWgpuRenderSurfaceProvider(first);
    setWgpuRenderSurfaceProvider(second);
    expect(getWgpuRenderSurfaceProvider()).toBe(second);
  });
});

function withThrowingDocument(run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    get(): never {
      throw new Error('portable WGPU code read document');
    },
  });
  try {
    run();
  } finally {
    if (descriptor === undefined) delete (globalThis as { document?: Document }).document;
    else Object.defineProperty(globalThis, 'document', descriptor);
  }
}
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, WgpuRenderSurfaceProvider } from '@flighthq/types/contract';
