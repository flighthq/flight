import type { NodeAny } from '@flighthq/node/contract';

import type { GuiEntity } from './GuiEntity.ts';

// The scene-document owner is not yet contract-isolated. Keep this dependency structural so the
// legacy nominal binding and its eventual owner contract are both accepted by GUI options.
export interface NodeInteractiveStateBinding extends GuiEntity {}

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
