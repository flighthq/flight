import type { Camera3D } from './Camera3D';
import type { Kind } from './Entity';
import type { FlightDocumentFields } from './FlightDocumentFieldSchema';
import type { FlightDocumentResourceDescriptor } from './FlightDocumentResource';
import type { Scene2D } from './Scene2D';
import type { Scene3D } from './Scene3D';
import type { Scene3DDocumentCamera, Scene3DDocumentLight } from './Scene3DDocument';
import type { Scene3DLights } from './Scene3DLights';

export interface FlightDocumentNode {
  children: FlightDocumentNode[];
  fields: FlightDocumentFields;
  kind: Kind;
}

// The dimension is metadata only: scene is an ordinary registered node and carries no duplicate
// Scene2D/Scene3D discriminator. The union prevents camera/light sections from crossing dimensions.
export type FlightDocument = FlightDocumentScene2D | FlightDocumentScene3D;

export interface FlightDocumentScene2D {
  backgroundColor: number | null;
  kind: 'Scene2D';
  resources: FlightDocumentResourceDescriptor[];
  scene: FlightDocumentNode;
  version: 1;
}

export interface FlightDocumentScene3D {
  cameras: Scene3DDocumentCamera[];
  kind: 'Scene3D';
  lights: Scene3DDocumentLight[];
  resources: FlightDocumentResourceDescriptor[];
  scene: FlightDocumentNode;
  version: 1;
}

export interface FlightDocumentScene2DMaterialization {
  scene: Scene2D;
}

export interface FlightDocumentScene3DMaterialization {
  cameras: Camera3D[];
  lights: Scene3DLights;
  scene: Scene3D;
}
