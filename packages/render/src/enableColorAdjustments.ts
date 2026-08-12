import { multiplyColorMatrix } from '@flighthq/adjustments/contract';
import { concatColorScaleBias, createColorScaleBias } from '@flighthq/materials/contract';
import { getNodeRuntime } from '@flighthq/node/contract';
import { createSlotTable } from '@flighthq/registry/contract';
import type {
  ColorAdjustmentRuntime,
  ColorScaleBias,
  Node,
  Renderable,
  RenderProxy,
  RenderState,
} from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { getRenderStateRuntime } from './renderState';

// Returns whether color-adjustment accumulation is installed on `state`.
export function areColorAdjustmentsEnabled(state: RenderState): boolean {
  return getRenderStateRuntime(state).registries.colorAdjustments?.entry?.state === RegistryEntryState.Bound;
}

// Installs color-adjustment accumulation on `state`. The base render walk reaches this module only
// through the persistent resolver slot, so states that do not opt in retain one empty-slot check and do
// not pull @flighthq/adjustments or @flighthq/materials into their bundle. Backend feature registrars
// that can realize these values call this as part of their own opt-in. Idempotent.
export function enableColorAdjustments(state: RenderState): void {
  const runtime = getRenderStateRuntime(state);
  const table = runtime.registries.colorAdjustments ?? createSlotTable('ColorAdjustments', 'Disabled');
  if (table.entry?.state === RegistryEntryState.Bound && table.entry.value === updateRenderProxyColorScaleBias) return;
  runtime.registries.colorAdjustments = {
    ...table,
    entry: { state: RegistryEntryState.Bound, value: updateRenderProxyColorScaleBias },
  };
}

// Hands the node's resolved color adjustment to the render node. A node's color-adjustment stack
// (NodeRuntime.colorAdjustments) is fused once into the affine `resolvedColorScaleBias` cache by the
// set-accessors on change — never per frame. The render walk then applies the local value first and its
// parent's inherited value second, matching the appearance and alpha axes: a transform on a container
// must reach every renderer-bearing descendant. Null and single-adjustment paths remain reference-only;
// only a node with both local and inherited adjustments performs composition. The result is the
// Adjustment-tier fold input; it is not a material and does not key the batch.
//
// Matrix-tier channel mixing travels through `resolvedColorMatrix`. A non-matrix operation that cannot
// be represented by either path leaves `colorAdjustmentsUnsupported` set, invoking the shakeable guard
// so unsupported adjustment data is reported rather than silently discarded.
function updateRenderProxyColorScaleBias(state: RenderState, data: RenderProxy, parentData?: RenderProxy): void {
  const runtime = getNodeRuntime(data.source as Node) as Readonly<Partial<ColorAdjustmentRuntime>>;
  const localColorScaleBias = runtime.resolvedColorScaleBias ?? null;
  const localColorMatrix = runtime.resolvedColorMatrix ?? null;
  const parentColorScaleBias = parentData?.colorScaleBias ?? null;
  const parentColorMatrix = parentData?.colorMatrix ?? null;

  if (localColorMatrix !== null || parentColorMatrix !== null) {
    data.colorMatrix = resolveInheritedColorMatrix(
      data.colorMatrix,
      parentColorMatrix,
      parentColorScaleBias,
      localColorMatrix,
      localColorScaleBias,
    );
    data.colorScaleBias = null;
  } else {
    data.colorMatrix = null;
    data.colorScaleBias = resolveInheritedColorScaleBias(
      data.colorScaleBias,
      parentColorScaleBias,
      localColorScaleBias,
    );
  }
  if (runtime.colorAdjustmentsUnsupported) {
    getRenderStateRuntime(state).colorAdjustmentUnsupportedGuard?.(state, data.source as Renderable);
  }
}

function resolveInheritedColorScaleBias(
  previous: ColorScaleBias | null,
  parent: Readonly<ColorScaleBias> | null,
  local: Readonly<ColorScaleBias> | null,
): ColorScaleBias | null {
  if (parent === null) return local;
  if (local === null) return parent;
  const out =
    previous !== parent && previous !== local && previous !== null && inheritedColorScaleBiases.has(previous)
      ? previous
      : createInheritedColorScaleBias();
  // SWF and scene-graph semantics apply the local adjustment first, then the parent's adjustment.
  concatColorScaleBias(out, parent, local);
  return out;
}

function resolveInheritedColorMatrix(
  previous: readonly number[] | null | undefined,
  parentMatrix: readonly number[] | null,
  parentColorScaleBias: Readonly<ColorScaleBias> | null,
  localMatrix: readonly number[] | null,
  localColorScaleBias: Readonly<ColorScaleBias> | null,
): readonly number[] {
  if (parentMatrix === null && parentColorScaleBias === null) return localMatrix!;
  if (localMatrix === null && localColorScaleBias === null) return parentMatrix!;

  const parent = parentMatrix ?? writeColorScaleBiasMatrix(parentColorMatrixScratch, parentColorScaleBias!);
  const local = localMatrix ?? writeColorScaleBiasMatrix(localColorMatrixScratch, localColorScaleBias!);
  const out =
    previous !== parentMatrix &&
    previous !== localMatrix &&
    previous !== null &&
    previous !== undefined &&
    inheritedColorMatrices.has(previous)
      ? (previous as number[])
      : createInheritedColorMatrix();
  return multiplyColorMatrix(parent, local, out);
}

function writeColorScaleBiasMatrix(out: number[], value: Readonly<ColorScaleBias>): number[] {
  out[0] = value.redScale;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = value.redBias;
  out[5] = 0;
  out[6] = value.greenScale;
  out[7] = 0;
  out[8] = 0;
  out[9] = value.greenBias;
  out[10] = 0;
  out[11] = 0;
  out[12] = value.blueScale;
  out[13] = 0;
  out[14] = value.blueBias;
  out[15] = 0;
  out[16] = 0;
  out[17] = 0;
  out[18] = value.alphaScale;
  out[19] = value.alphaBias;
  return out;
}

function createInheritedColorScaleBias(): ColorScaleBias {
  const value = createColorScaleBias();
  inheritedColorScaleBiases.add(value);
  return value;
}

function createInheritedColorMatrix(): number[] {
  const value = new Array<number>(20);
  inheritedColorMatrices.add(value);
  return value;
}

const inheritedColorScaleBiases = new WeakSet<ColorScaleBias>();
const inheritedColorMatrices = new WeakSet<readonly number[]>();
const parentColorMatrixScratch = new Array<number>(20);
const localColorMatrixScratch = new Array<number>(20);
