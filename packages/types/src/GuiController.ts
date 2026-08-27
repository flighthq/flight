import type { Node2D } from './Node2D';

export type GuiOrientation = 'horizontal' | 'vertical';

export type GuiTransitionProperty = 'alpha' | 'scaleX' | 'scaleY' | 'visible' | 'x' | 'y';

export type GuiTransitionValue = boolean | number;

// A controller creates one request for each user-visible property change. Calling apply with no
// argument writes the requested final value; an adapter may call it repeatedly with intermediate
// values from any animation system. This inversion keeps animation opt-in and keeps @flighthq/gui
// independent of a particular tween implementation.
export interface GuiTransitionRequest {
  readonly apply: (value?: GuiTransitionValue) => void;
  readonly from: GuiTransitionValue;
  readonly property: GuiTransitionProperty;
  readonly target: Node2D;
  readonly value: GuiTransitionValue;
}

export interface GuiTransitionDescriptor {
  readonly run: (request: Readonly<GuiTransitionRequest>) => void;
}

export interface GuiControllerOptions {
  transition?: Readonly<GuiTransitionDescriptor>;
}
