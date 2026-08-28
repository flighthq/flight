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

// Resources and version belong to the multi-scene container so every scene resolves through one shared
// table. The tuple makes the required one-or-more scene invariant part of the logical model; readers must
// still explain an empty parsed input before it can become this type and validate defaultScene at runtime.
export interface FlightDocument {
  defaultScene: number;
  resources: FlightDocumentResourceDescriptor[];
  scenes: [FlightDocumentScene, ...FlightDocumentScene[]];
  version: 1;
}

// The dimension is metadata only: scene is an ordinary registered node and carries no duplicate
// Scene2D/Scene3D discriminator. The union prevents camera/light sections from crossing dimensions.
export type FlightDocumentScene = FlightDocumentScene2D | FlightDocumentScene3D;

export interface FlightDocumentScene2D {
  backgroundColor: number | null;
  kind: 'Scene2D';
  scene: FlightDocumentNode;
}

export interface FlightDocumentScene3D {
  cameras: Scene3DDocumentCamera[];
  kind: 'Scene3D';
  lights: Scene3DDocumentLight[];
  scene: FlightDocumentNode;
}

export interface FlightDocumentScene2DMaterialization {
  scene: Scene2D;
}

export interface FlightDocumentScene3DMaterialization {
  cameras: Camera3D[];
  lights: Scene3DLights;
  scene: Scene3D;
}
