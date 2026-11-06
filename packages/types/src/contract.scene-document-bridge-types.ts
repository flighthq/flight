// Exact dependency bridge for interaction's document-aware extension callbacks. Interaction consumes
// Types, so importing its full contract back into scene-document would form a package cycle.
import type { NodeAny } from '@flighthq/node/contract';

type FlightDocumentScalarBridge = boolean | number | string | null;
type FlightDocumentValueBridge = FlightDocumentScalarBridge | FlightDocumentValueBridge[] | FlightDocumentFieldsBridge;

interface FlightDocumentFieldsBridge {
  [name: string]: FlightDocumentValueBridge;
}

export type NodeInteractiveStateProperty = 'alpha' | 'scaleX' | 'scaleY' | 'visible' | 'x' | 'y';
export type NodeInteractiveStateTransitionValue = boolean | number;

export interface NodeInteractiveStateTransitionRequest<N extends NodeAny = NodeAny, P extends string = string> {
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
