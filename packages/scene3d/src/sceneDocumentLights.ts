import { rotateVector3ByQuaternion } from '@flighthq/geometry/contract';
import {
  cloneAmbientLight,
  cloneDirectionalLight,
  cloneHemisphereLight,
  clonePointLight,
  cloneSpotLight,
  createScene3DLights,
} from '@flighthq/lighting/contract';
import type {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  PointLight,
  Scene3DDocument,
  Scene3DLights,
  SpotLight,
  Transform3DLike,
  Vector3Like,
} from '@flighthq/types/contract';
import {
  AmbientLightKind,
  DirectionalLightKind,
  HemisphereLightKind,
  PointLightKind,
  SpotLightKind,
} from '@flighthq/types/contract';

// Constructs the renderer-ready light draw argument carried by a Scene3DDocument without attaching any
// light to the assembled Scene3D. Document descriptors are cloned so resolving their local placement never
// mutates the parsed document. Directional/spot directions are rotated into world space; point/spot positions
// are transformed by the document light's authored TRS. Ambient and hemisphere lights have no placement.
//
// Scene3DLights has one ambient and one directional slot, so the first supported descriptor of each kind in
// document order wins. Every point, spot, and hemisphere descriptor is retained. Descriptors whose kind is
// not representable by Scene3DLights are left out. This is an initial-placement snapshot: a document light's
// optional node binding is not live, so an animation of that node does not update the returned descriptor.
export function createScene3DLightsFromDocument(document: Readonly<Scene3DDocument>): Scene3DLights {
  let ambient: AmbientLight | null = null;
  let directional: DirectionalLight | null = null;
  const hemisphere: HemisphereLight[] = [];
  const point: PointLight[] = [];
  const spot: SpotLight[] = [];

  for (let i = 0; i < document.lights.length; i++) {
    const source = document.lights[i];
    const descriptor = source.descriptor;
    if (descriptor.kind === AmbientLightKind) {
      if (ambient === null) ambient = cloneAmbientLight(descriptor as AmbientLight);
      continue;
    }
    if (descriptor.kind === DirectionalLightKind) {
      if (directional === null) {
        directional = cloneDirectionalLight(descriptor as DirectionalLight);
        rotateVector3ByQuaternion(directional.direction, directional.direction, source.transform.rotation);
      }
      continue;
    }
    if (descriptor.kind === HemisphereLightKind) {
      hemisphere.push(cloneHemisphereLight(descriptor as HemisphereLight));
      continue;
    }
    if (descriptor.kind === PointLightKind) {
      const resolved = clonePointLight(descriptor as PointLight);
      transformDocumentLightPosition(resolved.position, source.transform);
      point.push(resolved);
      continue;
    }
    if (descriptor.kind === SpotLightKind) {
      const resolved = cloneSpotLight(descriptor as SpotLight);
      transformDocumentLightPosition(resolved.position, source.transform);
      rotateVector3ByQuaternion(resolved.direction, resolved.direction, source.transform.rotation);
      spot.push(resolved);
    }
  }

  return createScene3DLights({ ambient, directional, hemisphere, point, spot });
}

// Applies scale, then rotation, then translation: the same TRS order as composeMatrix4FromTransform3D,
// without allocating a temporary matrix for each light. rotateVector3ByQuaternion is alias-safe.
function transformDocumentLightPosition(out: Vector3Like, transform: Readonly<Transform3DLike>): void {
  out.x *= transform.scale.x;
  out.y *= transform.scale.y;
  out.z *= transform.scale.z;
  rotateVector3ByQuaternion(out, out, transform.rotation);
  out.x += transform.position.x;
  out.y += transform.position.y;
  out.z += transform.position.z;
}
