import type { Kind } from './Entity';
import type { FlightDocumentFields } from './FlightDocumentFieldSchema';
import type { NodeAny } from './Node';
import type { NodeInteractiveStateProperty } from './NodeInteractiveStateBinding';

export type FlightDocumentInteractiveStateProperty = NodeInteractiveStateProperty;

export type FlightDocumentInteractiveStateValue = boolean | number;

export interface FlightDocumentInteractiveStateExtensionDescriptor {
  fields: FlightDocumentFields;
  kind: Kind;
}

export interface FlightDocumentInteractiveState {
  alpha?: number;
  extensions: FlightDocumentInteractiveStateExtensionDescriptor[];
  scaleX?: number;
  scaleY?: number;
  visible?: boolean;
  x?: number;
  y?: number;
}

export interface FlightDocumentInteractiveStates {
  disabled: FlightDocumentInteractiveState | null;
  hover: FlightDocumentInteractiveState | null;
  pressed: FlightDocumentInteractiveState | null;
}

export interface FlightDocumentInteractiveStateTransitionDescriptor {
  fields: FlightDocumentFields;
  kind: Kind;
}

// An inert association produced by scene materialization. It deliberately installs no listeners and
// changes no node property; callers opt into behavior through @flighthq/interaction.
export interface FlightDocumentInteractiveStateBinding<N extends NodeAny = NodeAny> {
  interactiveStates: FlightDocumentInteractiveStates;
  node: N;
  transition: FlightDocumentInteractiveStateTransitionDescriptor | null;
}
