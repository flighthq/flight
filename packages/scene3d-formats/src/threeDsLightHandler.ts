import {
  createTransform3D,
  createVector3,
  normalizeVector3,
  setQuaternionFromUnitVectors,
  subtractVector3,
} from '@flighthq/geometry/contract';
import { createPointLight, createSpotLight } from '@flighthq/lighting/contract';
import type {
  Light,
  Scene3DDocument,
  ThreeDsChunkHandler,
  ThreeDsDropTally,
  ThreeDsLight,
  ThreeDsParseState,
  Vector3,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_COLOR_BYTE,
  THREE_DS_COLOR_FLOAT,
  THREE_DS_LIGHT,
  THREE_DS_LIGHT_INNER_RANGE,
  THREE_DS_LIGHT_MULTIPLIER,
  THREE_DS_LIGHT_OFF,
  THREE_DS_LIGHT_OUTER_RANGE,
  THREE_DS_LIGHT_SPOT,
} from '@flighthq/types/contract';

import { convertPositionsZUpToYUp } from './shared.ts';
import { packThreeDsColor, parseColorChunk, readChunkEnd, tallyThreeDsDrop } from './threeDsParse.ts';

// Parses a light chunk (0x4600). The payload is the light's position (3 float32) followed by sub-chunks
// carrying its color, intensity multiplier, ranges, and — if the light is a spot — its aim and cone.
// Returns null when the payload is too short to hold the position.
export function parseThreeDsLight(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  name: string,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): ThreeDsLight | null {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  if (cursor + 12 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.light-truncated', '', { firstName: name });
    return null;
  }

  const position: readonly [number, number, number] = [
    view.getFloat32(cursor, true),
    view.getFloat32(cursor + 4, true),
    view.getFloat32(cursor + 8, true),
  ];
  cursor += 12;

  // A light with no color chunk is full-intensity white, and one with no multiplier is unscaled — both
  // are spec defaults, not absences to report.
  let color: readonly [number, number, number] = [1, 1, 1];
  let enabled = true;
  let falloff = 0;
  let hotspot = 0;
  let innerRange: number | null = null;
  let multiplier = 1;
  let outerRange: number | null = null;
  let target: readonly [number, number, number] | null = null;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) {
      tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.subchunk-exceeds-light', '', {
        firstName: name,
      });
      break;
    }
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_COLOR_FLOAT || chunkId === THREE_DS_COLOR_BYTE) {
      // A light's color chunk is a DIRECT sub-chunk, not wrapped in a material color block, so the scan
      // range starts at this chunk's own header rather than at its payload.
      const parsed = parseColorChunk(view, cursor, chunkEnd);
      if (parsed !== null) color = parsed;
    } else if (chunkId === THREE_DS_LIGHT_OFF) {
      enabled = false;
    } else if (chunkId === THREE_DS_LIGHT_MULTIPLIER) {
      if (dataStart + 4 <= chunkEnd) multiplier = view.getFloat32(dataStart, true);
    } else if (chunkId === THREE_DS_LIGHT_INNER_RANGE) {
      if (dataStart + 4 <= chunkEnd) innerRange = view.getFloat32(dataStart, true);
    } else if (chunkId === THREE_DS_LIGHT_OUTER_RANGE) {
      if (dataStart + 4 <= chunkEnd) outerRange = view.getFloat32(dataStart, true);
    } else if (chunkId === THREE_DS_LIGHT_SPOT) {
      // The spot sub-chunk states an aim TARGET POINT, then the two cone angles. Its presence is what
      // makes this a spot light rather than a point light.
      if (dataStart + 20 <= chunkEnd) {
        target = [
          view.getFloat32(dataStart, true),
          view.getFloat32(dataStart + 4, true),
          view.getFloat32(dataStart + 8, true),
        ];
        hotspot = view.getFloat32(dataStart + 12, true);
        falloff = view.getFloat32(dataStart + 16, true);
      } else {
        tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.light-spot-truncated', '', {
          firstName: name,
        });
      }
    }

    cursor = chunkEnd;
  }

  return { color, enabled, falloff, hotspot, innerRange, multiplier, name, outerRange, position, target };
}

export const threeDsLightHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_LIGHT],
  build(state: ThreeDsParseState): void {
    for (let i = 0; i < state.lights.length; i++) {
      appendThreeDsLightDocument(state.lights[i], state.document, state.drops);
    }
  },
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number, name: string): void {
    const light = parseThreeDsLight(view, offset, end, name, state.drops);
    if (light !== null) state.lights.push(light);
  },
};

export const threeDsLightFamily: readonly ThreeDsChunkHandler[] = [threeDsLightHandler];

// Appends one parsed 3DS light to the document's light placement table. A light carrying the spot
// sub-chunk becomes a SpotLight aimed at its target point; every other light is a PointLight, which is
// what the format's own default is. Per the document convention (see Scene3DDocumentLight) the descriptor
// is authored in the light's OWN LOCAL space — position at the origin, aim down -Z — and `transform`
// carries the placement and orientation read from the file.
function appendThreeDsLightDocument(
  light: Readonly<ThreeDsLight>,
  document: Scene3DDocument,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): void {
  const position = convertThreeDsPointZUpToYUp(light.position);
  const transform = createTransform3D();
  transform.position.x = position.x;
  transform.position.y = position.y;
  transform.position.z = position.z;

  const color = packThreeDsColor(light.color);
  // 3DS states a distance at which attenuation BEGINS (inner) and one at which the light stops (outer).
  // Flight carries the single cutoff, so the outer maps and the inner has nowhere to go.
  const range = light.outerRange ?? -1;
  if (light.innerRange !== null) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Skip, '3ds.light-inner-range-dropped', '', {
      firstName: light.name,
    });
  }

  // A light the author switched off is still an authored light; it imports with its placement and cone
  // intact at zero intensity, so re-enabling it is a single field write rather than a re-import.
  const intensity = light.enabled ? light.multiplier : 0;
  if (!light.enabled) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Skip, '3ds.light-disabled', '', {
      firstName: light.name,
    });
  }

  let descriptor: Light;
  if (light.target !== null) {
    const aim = convertThreeDsPointZUpToYUp(light.target);
    subtractVector3(aim, aim, position);
    if (normalizeVector3(aim, aim) > 0) {
      setQuaternionFromUnitVectors(transform.rotation, DOCUMENT_VIEW_LOCAL_AXIS, aim);
    }
    descriptor = createSpotLight({
      color,
      direction: DOCUMENT_VIEW_LOCAL_AXIS,
      // 3DS states the hotspot and falloff as FULL cone apertures; Flight's cone is described by its
      // half-angles, so each is halved rather than passed through.
      innerConeDegrees: light.hotspot / 2,
      intensity,
      outerConeDegrees: light.falloff / 2,
      range,
    });
  } else {
    descriptor = createPointLight({ color, intensity, range });
  }

  document.lights.push({
    descriptor,
    ...(light.name.length > 0 ? { name: light.name } : {}),
    transform,
  });
}

function convertThreeDsPointZUpToYUp(point: readonly [number, number, number]): Vector3 {
  const values = [point[0], point[1], point[2]];
  convertPositionsZUpToYUp(values);
  return createVector3(values[0], values[1], values[2]);
}

// The canonical local forward axis every placed document light and camera is authored against: -Z, with
// the entity's own `transform` supplying the orientation (see Scene3DDocumentLight).
const DOCUMENT_VIEW_LOCAL_AXIS = createVector3(0, 0, -1);
