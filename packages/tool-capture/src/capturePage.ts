// The recommended page-side integration. A project installs its normal render state once; the adapter
// registers the readable target before drawing, invokes the optional draw callback, and performs the
// complete versioned verification handshake only when tool-capture is driving the page.

import type { CanvasRenderState, DomRenderState, GlRenderState, Surface, WgpuRenderState } from '@flighthq/types';

import type { CaptureBenchmarkTarget, CaptureVerification } from './captureProtocol.js';
import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol.js';
import type { FunctionalRenderOracle, FunctionalTarget } from './functionalVerify.js';
import { registerFunctionalTarget, registerWgpuFunctionalTarget, runRenderVerification } from './functionalVerify.js';

export interface CapturePageTargetOptions {
  renderer: 'canvas' | 'dom' | 'webgl' | 'webgpu';
  state: CanvasRenderState | DomRenderState | GlRenderState | WgpuRenderState;
  /** Draw work to perform after registration. May be omitted when the page already rendered. */
  render?: () => void | Promise<void>;
  assertRender?: FunctionalRenderOracle;
  minCoverage?: number;
  width?: number;
  height?: number;
  scale?: number;
  /** Force verification outside a tool-capture browser. Primarily useful for integration tests. */
  verify?: boolean;
}

export interface CaptureElementTargetOptions {
  renderer: 'canvas' | 'dom' | 'webgl';
  element: HTMLElement;
  /** Existing WebGL context for a WebGL canvas. Required because requesting a second context is unreliable. */
  gl?: WebGLRenderingContext | WebGL2RenderingContext;
  render?: () => void | Promise<void>;
  assertRender?: FunctionalRenderOracle;
  minCoverage?: number;
  scale?: number;
  verify?: boolean;
}

/** Adapts a DOM or canvas element owned by another Flight-ecosystem renderer to the capture protocol. */
export function installCaptureElementTarget(
  options: Readonly<CaptureElementTargetOptions>,
): Promise<CaptureVerification | null> {
  if (options.renderer === 'dom') {
    return installCaptureTarget({
      ...options,
      state: { element: options.element } as unknown as DomRenderState,
      width: options.element.clientWidth,
      height: options.element.clientHeight,
    });
  }
  if (!(options.element instanceof HTMLCanvasElement)) {
    throw new Error(`capture ${options.renderer} target must be a canvas element`);
  }
  if (options.renderer === 'webgl' && options.gl === undefined) {
    throw new Error('capture webgl target requires its existing WebGL context');
  }
  const state =
    options.renderer === 'webgl'
      ? ({ canvas: options.element, gl: options.gl } as unknown as GlRenderState)
      : ({ canvas: options.element } as unknown as CanvasRenderState);
  return installCaptureTarget({
    ...options,
    state,
    width: options.element.width,
    height: options.element.height,
  });
}

/**
 * Installs and, while under tool-capture, verifies one render target. This is the only page-side API a
 * raw consumer needs; suite scheduling, screenshots, fingerprints, parity, reports, and retries remain
 * entirely on the CLI side.
 */
export async function installCaptureTarget(
  options: Readonly<CapturePageTargetOptions>,
): Promise<CaptureVerification | null> {
  const scale = options.scale ?? 1;
  if (options.renderer === 'webgpu') {
    registerWgpuFunctionalTarget(options.state as WgpuRenderState, scale);
  } else {
    registerFunctionalTarget(createFunctionalTarget(options, scale));
  }

  if (options.render !== undefined) {
    registerCaptureBenchmarkTarget({
      kind: options.renderer,
      run: options.render,
      synchronize: () => synchronizeCaptureTarget(options.renderer, options.state),
    });
  }

  await options.render?.();
  const flags = window as typeof window & { __flightCapture?: boolean; __flightCaptureVerify?: boolean };
  if (options.verify !== true && (!flags.__flightCapture || flags.__flightCaptureVerify === false)) return null;
  return verifyCaptureTarget(
    { assertRender: options.assertRender, minCoverage: options.minCoverage },
    options.renderer,
  );
}

/** Registers repeatable work for custom pages that do not use a Flight-style functional target. */
export function registerCaptureBenchmarkTarget<T extends CaptureBenchmarkTarget>(target: T): T {
  target.protocolVersion ??= CAPTURE_PROTOCOL_VERSION;
  (window as typeof window & { __ftBenchmarkTarget?: CaptureBenchmarkTarget }).__ftBenchmarkTarget = target;
  return target;
}

/** One-line runner integration for a target that a shared Flight-style factory already registered. */
export async function verifyCaptureTarget(
  testModule: Readonly<{ assertRender?: (surface: Readonly<Surface>) => void | Promise<void>; minCoverage?: number }>,
  renderer: string,
): Promise<CaptureVerification> {
  await runRenderVerification(testModule, renderer);
  return (window as typeof window & { __ftVerification: CaptureVerification }).__ftVerification;
}

function createFunctionalTarget(options: Readonly<CapturePageTargetOptions>, scale: number): FunctionalTarget {
  const state = options.state;
  const canvas = 'canvas' in state ? state.canvas : null;
  const element = 'element' in state ? state.element : null;
  const width = options.width ?? canvas?.width ?? element?.clientWidth ?? 0;
  const height = options.height ?? canvas?.height ?? element?.clientHeight ?? 0;
  const render = (): void => {};
  if (options.renderer === 'dom') return { kind: 'dom', state: state as DomRenderState, width, height, scale, render };
  if (options.renderer === 'webgl')
    return { kind: 'webgl', state: state as GlRenderState, width, height, scale, render };
  return { kind: 'canvas', state: state as CanvasRenderState, width, height, scale, render };
}

async function synchronizeCaptureTarget(
  renderer: CapturePageTargetOptions['renderer'],
  state: CapturePageTargetOptions['state'],
): Promise<void> {
  if (renderer === 'webgl') {
    (state as GlRenderState).gl.finish();
  } else if (renderer === 'webgpu') {
    await (state as WgpuRenderState).device.queue.onSubmittedWorkDone();
  } else if (renderer === 'dom') {
    (state as DomRenderState).element.getBoundingClientRect();
  }
}
