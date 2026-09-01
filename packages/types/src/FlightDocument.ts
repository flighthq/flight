import type { Camera3D } from './Camera3D';
import type { Kind } from './Entity';
import type { FlightDocumentFields } from './FlightDocumentFieldSchema';
import type {
  FlightDocumentInteractiveStateBinding,
  FlightDocumentInteractiveStates,
  FlightDocumentInteractiveStateTransitionDescriptor,
} from './FlightDocumentInteractiveState';
import type { FlightDocumentResourceDescriptor } from './FlightDocumentResource';
import type { FlightDocumentToken } from './FlightDocumentToken';
import type { Node2D } from './Node2D';
import type { Node3D } from './Node3D';
import type { Scene2D } from './Scene2D';
import type { Scene3D } from './Scene3D';
import type { Scene3DDocumentCamera, Scene3DDocumentLight } from './Scene3DDocument';
import type { Scene3DLights } from './Scene3DLights';

export interface FlightDocumentNode {
  children: FlightDocumentNode[];
  fields: FlightDocumentFields;
  interactiveStates?: FlightDocumentInteractiveStates | null;
  kind: Kind;
  transition?: FlightDocumentInteractiveStateTransitionDescriptor | null;
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
  tokens: FlightDocumentToken[];
}

export interface FlightDocumentScene3D {
  cameras: Scene3DDocumentCamera[];
  kind: 'Scene3D';
  lights: Scene3DDocumentLight[];
  scene: FlightDocumentNode;
  tokens: FlightDocumentToken[];
}

export interface FlightDocumentScene2DMaterialization {
  interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node2D>[];
  scene: Scene2D;
}

export interface FlightDocumentScene3DMaterialization {
  cameras: Camera3D[];
  interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node3D>[];
  lights: Scene3DLights;
  scene: Scene3D;
}
