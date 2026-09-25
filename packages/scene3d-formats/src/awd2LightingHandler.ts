import {
  createTransform3D,
  createVector3,
  normalizeVector3,
  setQuaternionFromUnitVectors,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createAmbientLight, createDirectionalLight, createPointLight } from '@flighthq/lighting/contract';
import type {
  Awd2BlockHandler,
  Awd2ParsedLight,
  Awd2ParsedLightPicker,
  ImportDiagnostic,
  Light,
  Awd2ParseState,
  Scene3DDocument,
  Transform3D,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import {
  awdTransformToTransform3D,
  readAwdProperties,
  readAwdPropertyNumber,
  readAwdPropertyUint32,
  readAwdPropertyUint8,
  readAwdString,
  readAwdTransform,
} from './awd2Reader.ts';
import {
  AWD2_BLOCK_LIGHT,
  AWD2_BLOCK_LIGHT_PICKER,
  AWD2_LIGHT_DEFAULT_AMBIENT,
  AWD2_LIGHT_DEFAULT_DIFFUSE,
  AWD2_LIGHT_DEFAULT_FALLOFF,
  AWD2_LIGHT_DEFAULT_RADIUS,
  AWD2_LIGHT_DEFAULT_RGB,
  AWD2_LIGHT_DEFAULT_SPECULAR,
  AWD2_LIGHT_PROP_AMBIENT,
  AWD2_LIGHT_PROP_AMBIENT_COLOR,
  AWD2_LIGHT_PROP_COLOR,
  AWD2_LIGHT_PROP_DIFFUSE,
  AWD2_LIGHT_PROP_DIRECTION_X,
  AWD2_LIGHT_PROP_DIRECTION_Y,
  AWD2_LIGHT_PROP_DIRECTION_Z,
  AWD2_LIGHT_PROP_FALLOFF,
  AWD2_LIGHT_PROP_RADIUS,
  AWD2_LIGHT_PROP_SHADOW_MAPPER,
  AWD2_LIGHT_PROP_SPECULAR,
  AWD2_LIGHT_TYPE_DIRECTIONAL,
  AWD2_LIGHT_TYPE_POINT,
  AWD2_BUILD_PHASE_LIGHTING,
} from './awd2Schema.ts';

// Lights and light pickers. A light fills the document's PLACEMENT TABLE rather than the node graph — in
// Flight a light is a per-draw argument the caller reads off the document, not a scene member — so this
// builds after the node passes, when a light parented to a container resolves to that container's index.
//
// Pickers are read to DETECT scoping, never to build with: Away3D binds a picker to a material, so a file
// can light different materials with different subsets, and Flight's light set is scene-wide. Reporting
// that is the whole of what a picker does here.

export const awd2LightHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_LIGHT],
  buildPhase: AWD2_BUILD_PHASE_LIGHTING,
  parse(state, block) {
    const light = parseLightBlock(
      block.view,
      block.source,
      block.dataStart,
      block.dataEnd,
      block.matrixWide,
      state.diagnostics,
    );
    if (light !== null) state.lights.set(block.blockId, light);
  },
  build(state) {
    const drops = new Map<string, AwdLightDropTally>();
    for (const light of state.lights.values()) {
      buildAwdDocumentLights(light, state.nodeIndexForBlock.get(light.parentId), state.document, drops);
    }
    flushAwdLightDrops(drops, state.diagnostics);
  },
};

// Pickers are read to DETECT scoping, never to build with, so this handler's whole contribution is the
// report. Registering it without the light handler reports every picked light as missing, which is
// accurate: this build did not parse them.
export const awd2LightPickerHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_LIGHT_PICKER],
  buildPhase: AWD2_BUILD_PHASE_LIGHTING,
  parse(state, block) {
    const picker = parseLightPickerBlock(block.view, block.source, block.dataStart, block.dataEnd, state.diagnostics);
    if (picker !== null) state.lightPickers.set(block.blockId, picker);
  },
  build(state) {
    reportAwdLightPickerScope(state);
  },
};

// Parses a Light block (type 41). Layout:
// Scene3DHeader(parentId → matrix → name) → lightType(uint8) → PropertyList → UserAttrList.
// The matrix is the light's placement; Away3D applies it to a POINT light and ignores it for a
// DIRECTIONAL one (whose aim lives in properties 21/22/23 as a world-space vector), so this parser
// mirrors that rather than baking a rotation a directional light never used.
function parseLightBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedLight | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 4 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.light-truncated', 'parseLightBlock', {
      field: 'parentId',
    });
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.light-truncated', 'parseLightBlock', {
      field: 'transform',
    });
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end || offset + 2 + dv.getUint16(offset, true) > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.light-truncated', 'parseLightBlock', {
      field: 'name',
    });
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 1 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.light-truncated', 'parseLightBlock', {
      field: 'lightType',
    });
    return null;
  }
  const lightType = (source as Uint8Array)[offset];
  offset += 1;

  const props = readAwdProperties(view, offset, end);
  const values = props.values;
  const hasRadius = values.has(AWD2_LIGHT_PROP_RADIUS);
  return {
    ambient: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_AMBIENT) ?? AWD2_LIGHT_DEFAULT_AMBIENT,
    ambientRgb: readAwdPropertyUint32(view, values, AWD2_LIGHT_PROP_AMBIENT_COLOR) ?? AWD2_LIGHT_DEFAULT_RGB,
    castsShadow: (readAwdPropertyUint8(view, values, AWD2_LIGHT_PROP_SHADOW_MAPPER) ?? 0) > 0,
    diffuse: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_DIFFUSE) ?? AWD2_LIGHT_DEFAULT_DIFFUSE,
    directionX: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_DIRECTION_X) ?? 0,
    directionY: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_DIRECTION_Y) ?? -1,
    directionZ: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_DIRECTION_Z) ?? 1,
    fallOff: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_FALLOFF) ?? AWD2_LIGHT_DEFAULT_FALLOFF,
    hasRadius,
    lightType,
    name: nameResult.value,
    parentId,
    radius: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_RADIUS) ?? AWD2_LIGHT_DEFAULT_RADIUS,
    rgb: readAwdPropertyUint32(view, values, AWD2_LIGHT_PROP_COLOR) ?? AWD2_LIGHT_DEFAULT_RGB,
    specular: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_SPECULAR) ?? AWD2_LIGHT_DEFAULT_SPECULAR,
    transform: transformResult.transform,
  };
}

// Parses a LightPicker block (type 51). Layout:
// name(VarString) → numLights(uint16) → lightIds(uint32 × N) → UserAttrList. Unlike most AWD blocks it
// carries no property list.
function parseLightPickerBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedLightPicker | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end || offset + 2 + dv.getUint16(offset, true) > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.light-picker-truncated',
      'parseLightPickerBlock',
      { field: 'name' },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.light-picker-truncated',
      'parseLightPickerBlock',
      { field: 'numLights' },
    );
    return null;
  }
  const numLights = dv.getUint16(offset, true);
  offset += 2;

  if (offset + numLights * 4 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.light-picker-truncated',
      'parseLightPickerBlock',
      { field: 'lightIds', lights: numLights },
    );
    return null;
  }
  const lightIds: number[] = [];
  for (let i = 0; i < numLights; i++) {
    lightIds.push(dv.getUint32(offset, true));
    offset += 4;
  }

  return { lightIds, name: nameResult.value };
}

// Appends one AWD light block to the document's light table. An AWD light is a COMPOUND: it carries a
// punctual term (`color` × `diffuse`, aimed or placed) and its own ambient term (`ambientColor` ×
// `ambient`) on the same entity. Flight models those as two separate descriptors, so one block emits a
// DirectionalLight/PointLight plus — only when the file gave it a non-zero ambient — a sibling AmbientLight
// named after it. Splitting is what makes the import lossless: folding the ambient into the punctual color
// would tint the wrong term, and dropping it would lose the fill the author set.
//
// `node` binds the light to the document node its AWD parent block produced, so an animated parent carries
// the light with it. Placement follows the document convention (see Scene3DDocumentLight): the descriptor
// holds the light in its own LOCAL space and `transform` places and orients it. AWD states a directional
// aim as a world-space vector, so that vector becomes the transform's rotation off the canonical -Z axis
// rather than being written onto the descriptor.
function buildAwdDocumentLights(
  light: Readonly<Awd2ParsedLight>,
  nodeIndex: number | undefined,
  document: Scene3DDocument,
  drops: Map<string, AwdLightDropTally>,
): void {
  let descriptor: Light;
  let transform: Transform3D;
  if (light.lightType === AWD2_LIGHT_TYPE_DIRECTIONAL) {
    // AWD aims its lights in a LEFT-handed space; the whole file is converted to Flight's right-handed one
    // by negating z, the same single-axis flip readAwdTransform applies to every placement matrix.
    const aim = createVector3(light.directionX, light.directionY, -light.directionZ);
    normalizeVector3(aim, aim);
    transform = createTransform3D();
    setQuaternionFromUnitVectors(transform.rotation, DOCUMENT_LIGHT_LOCAL_AXIS, aim);
    descriptor = createDirectionalLight({
      castsShadow: light.castsShadow,
      color: getAwdLightRgba(light.rgb),
      direction: DOCUMENT_LIGHT_LOCAL_AXIS,
      intensity: light.diffuse,
    });
  } else if (light.lightType === AWD2_LIGHT_TYPE_POINT) {
    // The point light's placement is the block matrix, carried on `transform`; the descriptor's own
    // `position` stays at the local origin, which is where the convention puts an unplaced light.
    transform = awdTransformToTransform3D(light.transform);
    descriptor = createPointLight({
      castsShadow: light.castsShadow,
      color: getAwdLightRgba(light.rgb),
      intensity: light.diffuse,
      // Away3D's falloff runs from `radius` (full brightness) to `fallOff` (zero); Flight's `range` is the
      // single cutoff distance, so the END maps and the START has nowhere to go.
      range: light.fallOff,
    });
    if (light.hasRadius) {
      tallyAwdLightDrop(drops, ImportDiagnosticSeverity.Skip, 'awd2.light-radius-dropped', 'buildAwdDocumentLights', {
        firstLight: light.name,
      });
    }
  } else {
    tallyAwdLightDrop(drops, ImportDiagnosticSeverity.Skip, 'awd2.light-unsupported-type', 'buildAwdDocumentLights', {
      firstLight: light.name,
      firstType: light.lightType,
    });
    return;
  }

  // Away3D scales a light's specular response independently of its diffuse one. Flight's punctual lights
  // carry a single intensity that drives both, so a file that pulled them apart loses that separation.
  if (light.specular !== AWD2_LIGHT_DEFAULT_SPECULAR) {
    tallyAwdLightDrop(drops, ImportDiagnosticSeverity.Skip, 'awd2.light-specular-dropped', 'buildAwdDocumentLights', {
      firstLight: light.name,
      firstSpecular: light.specular,
    });
  }

  document.lights.push({ descriptor, name: light.name || undefined, node: nodeIndex, transform });

  if (light.ambient !== 0) {
    document.lights.push({
      descriptor: createAmbientLight({ color: getAwdLightRgba(light.ambientRgb), intensity: light.ambient }),
      name: light.name ? `${light.name} Ambient` : undefined,
      node: nodeIndex,
      transform: createTransform3D(),
    });
  }
}

// Packs an AWD light's 24-bit 0xrrggbb color into a Flight 0xrrggbbaa one. A light has no alpha channel in
// either model, so the imported color is always fully opaque.
function getAwdLightRgba(rgb: number): number {
  return (((rgb << 8) >>> 0) | 0xff) >>> 0;
}

// The canonical local aim every placed document light is authored against: -Z, with the light's own
// `transform` supplying the orientation (see Scene3DDocumentLight). Read-only — createDirectionalLight
// clones the direction it is given, and setQuaternionFromUnitVectors only reads its `from`.
const DOCUMENT_LIGHT_LOCAL_AXIS = createVector3(0, 0, -1);

// One accumulated light-import drop: total `count` plus the first offender's `detail`, keyed by kind — a
// file with fifty identically-configured lights states each loss once, not fifty times.
interface AwdLightDropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  // ★ CARRIED RATHER THAN ASSERTED AT THE FLUSH. `origin` must name the function that DETECTED the loss,
  // and the flush loop is not it — it runs from parseAwd2, one pass later. Naming the detector as a
  // literal down there was correct and unverifiable: nothing tied the string to the function, so a rename
  // would have left it pointing at a name that no longer exists. Recording it where the loss is seen makes
  // the claim structural, and the origin check treats a relayed value as judged at its source.
  origin: string;
  severity: ImportDiagnosticSeverity;
}

// Records one offender against its kind tally, keeping the first offender's detail and bumping the count
// for later ones. Mirrors tallyUnhandledAwdBlock; flushed by flushAwdLightDrops.
function tallyAwdLightDrop(
  tallies: Map<string, AwdLightDropTally>,
  severity: ImportDiagnosticSeverity,
  kind: string,
  origin: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  const existing = tallies.get(kind);
  if (existing === undefined) tallies.set(kind, { count: 1, detail: firstDetail, kind, origin, severity });
  else existing.count++;
}

// Emits one crumb per accumulated light-drop kind, relaying each tally's own recorded origin — the
// function that detected the loss, which is never this loop.
function flushAwdLightDrops(tallies: Readonly<Map<string, AwdLightDropTally>>, diagnostics?: ImportDiagnostic[]): void {
  for (const tally of tallies.values()) {
    reportImportDiagnostic(diagnostics, tally.severity, tally.kind, tally.origin, {
      ...tally.detail,
      count: tally.count,
    });
  }
}

// Whether the file's light pickers scope lighting in a way Flight's scene-wide light set cannot express.
// Away3D assigns a picker per MATERIAL, so a file can light one material with a subset of its lights;
// Flight passes one light set to a whole draw. The scoping is representable only when every picker selects
// exactly the full set of lights the file declares — then "each material's lights" and "the scene's lights"
// are the same set and nothing is lost.
//
// A file with NO picker at all is not a loss and reports nothing: it expressed no scoping to drop, and the
// document's light table is inert — the caller reads it and chooses what to draw with, so an unpicked
// light lights nothing until someone asks it to.
function isAwdLightScopeDropped(
  lightBlockIds: ReadonlySet<number>,
  pickers: Readonly<Map<number, Awd2ParsedLightPicker>>,
): boolean {
  if (lightBlockIds.size === 0) return false;
  for (const picker of pickers.values()) {
    const picked = new Set(picker.lightIds);
    if (picked.size !== lightBlockIds.size) return true;
    for (const id of lightBlockIds) if (!picked.has(id)) return true;
  }
  return false;
}

// Reports what the file's pickers scoped and Flight's scene-wide light set cannot express, plus any
// picker naming a light the file never declared. Pickers are never built from, so this is the whole of
// what they contribute.
function reportAwdLightPickerScope(state: Awd2ParseState): void {
  for (const [blockId, picker] of state.lightPickers) {
    for (const lightId of picker.lightIds) {
      if (state.lights.has(lightId)) continue;
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.light-picker-missing-light',
        'parseAwd2',
        { block: blockId, light: lightId },
      );
    }
  }
  if (isAwdLightScopeDropped(new Set(state.lights.keys()), state.lightPickers)) {
    reportImportDiagnostic(state.diagnostics, ImportDiagnosticSeverity.Skip, 'awd2.light-scope-dropped', 'parseAwd2', {
      lights: state.lights.size,
      pickers: state.lightPickers.size,
    });
  }
}
