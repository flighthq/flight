// Exact dependency bridge for the two interaction callback shapes exposed by Scene Document.
// Interaction consumes Scene Document at runtime, so the document contract cannot import Interaction
// back. The property union is declared by each owner and no longer crosses this seam.
import type { NodeAny } from '@flighthq/node/contract';

type FlightDocumentScalarBridge = boolean | number | string | null;
type FlightDocumentValueBridge = FlightDocumentScalarBridge | FlightDocumentValueBridge[] | FlightDocumentFieldsBridge;

interface FlightDocumentFieldsBridge {
  [name: string]: FlightDocumentValueBridge;
}

type NodeInteractiveStateTransitionValue = boolean | number;

interface NodeInteractiveStateTransitionRequest<N extends NodeAny = NodeAny, P extends string = string> {
  readonly apply: (value?: NodeInteractiveStateTransitionValue) => void;
  readonly from: NodeInteractiveStateTransitionValue;
  readonly property: P;
  readonly target: N;
  readonly value: NodeInteractiveStateTransitionValue;
}

export interface NodeInteractiveStateTransition<N extends NodeAny = NodeAny, P extends string = string> {
  readonly run: (request: Readonly<NodeInteractiveStateTransitionRequest<N, P>>) => void;
}

export interface NodeInteractiveStateExtensionRuntime {
  apply: (
    fields: Readonly<FlightDocumentFieldsBridge>,
    transition: Readonly<NodeInteractiveStateTransition> | null,
  ) => boolean;
  capture: (out: FlightDocumentFieldsBridge) => boolean;
  dispose: () => void;
}
