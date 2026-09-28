import { createPerspectiveProjection } from '@flighthq/camera/contract';
import {
  createQuaternion,
  createTransform3D,
  createVector3,
  multiplyQuaternion,
  normalizeVector3,
  setQuaternionFromAxisAngle,
  setQuaternionFromUnitVectors,
  subtractVector3,
} from '@flighthq/geometry/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import type {
  Scene3DDocument,
  ThreeDsCamera,
  ThreeDsChunkHandler,
  ThreeDsDropTally,
  ThreeDsParseState,
  Vector3,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  THREE_DS_CAMERA_APERTURE_MM,
  THREE_DS_CAMERA_RANGES,
  THREE_DS_CAMERA,
  THREE_DS_CHUNK_HEADER_BYTES,
} from '@flighthq/types/contract';

import { convertPositionsZUpToYUp } from './shared.ts';
import { readChunkEnd, tallyThreeDsDrop } from './threeDsParse.ts';

// Parses a camera chunk (0x4700). The payload is a fixed 32-byte record — position (3 float32), aim
// target (3 float32), bank/roll angle in degrees, and lens focal length in millimetres — followed by
// sub-chunks, of which only CAM_RANGES carries data Flight models. Returns null when the payload is too
// short to hold the fixed record.
export function parseThreeDsCamera(
  view: Readonly<DataView>,
  offset: number,
  end: number,
  name: string,
  threeDsDrops: Map<string, ThreeDsDropTally> | null,
): ThreeDsCamera | null {
  let cursor = offset + THREE_DS_CHUNK_HEADER_BYTES;
  if (cursor + 32 > end) {
    tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Drop, '3ds.camera-truncated', '', { firstName: name });
    return null;
  }

  const position: readonly [number, number, number] = [
    view.getFloat32(cursor, true),
    view.getFloat32(cursor + 4, true),
    view.getFloat32(cursor + 8, true),
  ];
  const target: readonly [number, number, number] = [
    view.getFloat32(cursor + 12, true),
    view.getFloat32(cursor + 16, true),
    view.getFloat32(cursor + 20, true),
  ];
  const roll = view.getFloat32(cursor + 24, true);
  const focalLength = view.getFloat32(cursor + 28, true);
  cursor += 32;

  let far: number | null = null;
  let near: number | null = null;

  while (cursor + THREE_DS_CHUNK_HEADER_BYTES <= end) {
    const chunkId = view.getUint16(cursor, true);
    const chunkEnd = readChunkEnd(view, cursor, end);
    if (chunkEnd < 0) {
      tallyThreeDsDrop(threeDsDrops, ImportDiagnosticSeverity.Recover, '3ds.subchunk-exceeds-camera', '', {
        firstName: name,
      });
      break;
    }
    const dataStart = cursor + THREE_DS_CHUNK_HEADER_BYTES;

    if (chunkId === THREE_DS_CAMERA_RANGES && dataStart + 8 <= chunkEnd) {
      near = view.getFloat32(dataStart, true);
      far = view.getFloat32(dataStart + 4, true);
    }

    cursor = chunkEnd;
  }

  return { far, focalLength, name, near, position, roll, target };
}

export const threeDsCameraHandler: Readonly<ThreeDsChunkHandler> = {
  chunkIds: [THREE_DS_CAMERA],
  build(state: ThreeDsParseState): void {
    for (let i = 0; i < state.cameras.length; i++) appendThreeDsCameraDocument(state.cameras[i], state.document);
  },
  collect(state: ThreeDsParseState, view: Readonly<DataView>, offset: number, end: number, name: string): void {
    const camera = parseThreeDsCamera(view, offset, end, name, state.drops);
    if (camera !== null) state.cameras.push(camera);
  },
};

// Appends one parsed 3DS camera to the document's camera placement table. The file states a position and
// an aim TARGET POINT; the document wants an orientation, so the aim is derived as the normalized
// target−position and baked into `transform.rotation` as the rotation carrying the canonical camera
// forward axis (-Z) onto it, with the file's bank angle applied as a roll about that same aim.
//
// The lens is a focal length in millimetres, not an angle. It converts to a HORIZONTAL field of view
// against the 35mm gate the format meters against (see THREE_DS_CAMERA_APERTURE_MM); with no aspect ratio
// anywhere in the format, the camera is emitted at aspect 1, where the horizontal and vertical fields of
// view coincide — the same shape glTF lands on for a camera whose `aspectRatio` is absent.
function appendThreeDsCameraDocument(camera: Readonly<ThreeDsCamera>, document: Scene3DDocument): void {
  const position = convertThreeDsPointZUpToYUp(camera.position);
  const transform = createTransform3D();
  transform.position.x = position.x;
  transform.position.y = position.y;
  transform.position.z = position.z;

  const aim = convertThreeDsPointZUpToYUp(camera.target);
  subtractVector3(aim, aim, position);
  if (normalizeVector3(aim, aim) > 0) {
    setQuaternionFromUnitVectors(transform.rotation, DOCUMENT_VIEW_LOCAL_AXIS, aim);
    if (camera.roll !== 0) {
      // The bank angle turns the camera about the axis it is already aiming down, so the roll composes
      // AFTER the aim: rotating about `aim` in world terms is a left-multiply onto the aim rotation.
      const roll = createQuaternion();
      setQuaternionFromAxisAngle(roll, aim, camera.roll * DEG_TO_RAD);
      multiplyQuaternion(transform.rotation, roll, transform.rotation);
    }
  }

  // A lens of zero (or a nonsensical negative) states no usable angle; fall back to the format's own
  // default 50mm lens rather than emitting a degenerate projection.
  const focalLength = camera.focalLength > 0 ? camera.focalLength : THREE_DS_DEFAULT_FOCAL_LENGTH_MM;

  document.cameras.push({
    // CAM_RANGES is optional. When it is absent the clip planes are 3DS's own camera defaults, not
    // invented ones, so an imported camera frames the same depth span the authoring tool showed.
    far: camera.far ?? THREE_DS_DEFAULT_FAR,
    ...(camera.name.length > 0 ? { name: camera.name } : {}),
    near: camera.near ?? THREE_DS_DEFAULT_NEAR,
    projection: createPerspectiveProjection({ fovY: 2 * Math.atan(THREE_DS_CAMERA_APERTURE_MM / (2 * focalLength)) }),
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

// 3DS's own camera defaults, used only when the file omits the chunk that would state them: the stock
// 50mm lens, and the CAM_RANGES clip span.
const THREE_DS_DEFAULT_FAR = 1000;

const THREE_DS_DEFAULT_FOCAL_LENGTH_MM = 50;

const THREE_DS_DEFAULT_NEAR = 1;
