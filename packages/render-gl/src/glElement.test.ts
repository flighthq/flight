import {
  createGlCanvasElement,
  createGlRenderSurface,
  explainGlRenderSurfaceAbsence,
  getGlRenderSurfaceProvider,
  resetGlRenderSurfaceProviderForTest,
  setGlRenderSurfaceProvider,
} from './glElement';

describe('createGlCanvasElement', () => {
  afterEach(() => {
    resetGlRenderSurfaceProviderForTest();
  });

  it('preserves the canonical provider result identity', () => {
    const surface = {} as HTMLCanvasElement;
    setGlRenderSurfaceProvider({ createRenderSurface: () => surface });
    expect(createGlCanvasElement(100, 200, 2)).toBe(surface);
  });

  it('throws an actionable Web-only setup error when the provider is absent', () => {
    expect(() => createGlCanvasElement(100, 200)).toThrowError(
      /enableHostWebGlRenderSurface\(\).*inject a GlRenderSurfaceProvider/,
    );
  });

  it('throws the same setup error when the provider refuses', () => {
    setGlRenderSurfaceProvider({ createRenderSurface: () => null });
    expect(() => createGlCanvasElement(100, 200)).toThrowError(/enableHostWebGlRenderSurface\(\)/);
  });
});

describe('createGlRenderSurface', () => {
  afterEach(() => {
    resetGlRenderSurfaceProviderForTest();
  });

  it('returns null when no provider is selected', () => {
    expect(createGlRenderSurface(100, 200)).toBeNull();
  });

  it('passes exact dimensions and the default pixel ratio to the selected provider', () => {
    const surface = {} as HTMLCanvasElement;
    const createRenderSurface = vi.fn(() => surface);
    setGlRenderSurfaceProvider({ createRenderSurface });

    expect(createGlRenderSurface(100, 200)).toBe(surface);
    expect(createRenderSurface).toHaveBeenCalledOnce();
    expect(createRenderSurface).toHaveBeenCalledWith(100, 200, 1);
  });

  it('passes an explicit pixel ratio and preserves the provider result identity', () => {
    const surface = {} as HTMLCanvasElement;
    const createRenderSurface = vi.fn(() => surface);
    setGlRenderSurfaceProvider({ createRenderSurface });

    expect(createGlRenderSurface(300, 150, 2.5)).toBe(surface);
    expect(createRenderSurface).toHaveBeenCalledWith(300, 150, 2.5);
  });

  it('selects replacements and reset restores omission', () => {
    const first = {} as HTMLCanvasElement;
    const second = {} as HTMLCanvasElement;
    const firstProvider = { createRenderSurface: vi.fn(() => first) };
    const secondProvider = { createRenderSurface: vi.fn(() => second) };

    setGlRenderSurfaceProvider(firstProvider);
    expect(getGlRenderSurfaceProvider()).toBe(firstProvider);
    expect(createGlRenderSurface(1, 2)).toBe(first);

    setGlRenderSurfaceProvider(secondProvider);
    expect(getGlRenderSurfaceProvider()).toBe(secondProvider);
    expect(createGlRenderSurface(3, 4)).toBe(second);

    resetGlRenderSurfaceProviderForTest();
    expect(getGlRenderSurfaceProvider()).toBeNull();
    expect(createGlRenderSurface(5, 6)).toBeNull();
  });

  it('preserves provider refusal as null', () => {
    setGlRenderSurfaceProvider({ createRenderSurface: () => null });
    expect(createGlRenderSurface(100, 200)).toBeNull();
  });

  it('lets a native host provide a surface without reading document', () => {
    const surface = {} as HTMLCanvasElement;
    setGlRenderSurfaceProvider({ createRenderSurface: () => surface });

    withThrowingDocument(() => {
      expect(createGlRenderSurface(100, 200)).toBe(surface);
    });
  });

  it('returns null for omission and refusal without reading document', () => {
    withThrowingDocument(() => {
      expect(createGlRenderSurface(100, 200)).toBeNull();
      setGlRenderSurfaceProvider({ createRenderSurface: () => null });
      expect(createGlRenderSurface(100, 200)).toBeNull();
    });
  });
});

describe('explainGlRenderSurfaceAbsence', () => {
  afterEach(() => {
    resetGlRenderSurfaceProviderForTest();
  });

  it('reports provider omission as a plain reason', () => {
    expect(explainGlRenderSurfaceAbsence()).toEqual({ reason: 'provider-not-installed' });
  });

  it('returns null whenever a provider is installed, including one that refuses a surface', () => {
    setGlRenderSurfaceProvider({ createRenderSurface: () => null });
    expect(explainGlRenderSurfaceAbsence()).toBeNull();
  });
});

describe('getGlRenderSurfaceProvider', () => {
  afterEach(() => {
    resetGlRenderSurfaceProviderForTest();
  });

  it('returns the exact selected provider', () => {
    const provider = { createRenderSurface: () => ({}) as HTMLCanvasElement };
    setGlRenderSurfaceProvider(provider);
    expect(getGlRenderSurfaceProvider()).toBe(provider);
  });
});

describe('resetGlRenderSurfaceProviderForTest', () => {
  it('restores provider omission', () => {
    setGlRenderSurfaceProvider({ createRenderSurface: () => ({}) as HTMLCanvasElement });
    resetGlRenderSurfaceProviderForTest();
    expect(getGlRenderSurfaceProvider()).toBeNull();
    expect(createGlRenderSurface(1, 1)).toBeNull();
  });
});

describe('setGlRenderSurfaceProvider', () => {
  afterEach(() => {
    resetGlRenderSurfaceProviderForTest();
  });

  it('replaces the selected provider', () => {
    const first = { createRenderSurface: () => ({}) as HTMLCanvasElement };
    const second = { createRenderSurface: () => ({}) as HTMLCanvasElement };
    setGlRenderSurfaceProvider(first);
    setGlRenderSurfaceProvider(second);
    expect(getGlRenderSurfaceProvider()).toBe(second);
  });
});

function withThrowingDocument(run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    get(): never {
      throw new Error('portable GL code read document');
    },
  });
  try {
    run();
  } finally {
    if (descriptor === undefined) delete (globalThis as { document?: Document }).document;
    else Object.defineProperty(globalThis, 'document', descriptor);
  }
}
