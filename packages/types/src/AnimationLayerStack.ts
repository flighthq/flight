// Animation contracts are owned by `@flighthq/animation`. These deprecated re-exports keep existing
// `@flighthq/types` imports compiling until consumers import the owning package.

/** @deprecated Import from `@flighthq/animation/contract`. */
export type {
  AnimationLayerOptions,
  AnimationLayer,
  AnimationLayerStackChannelSource,
  AnimationLayerStackChannel,
  AnimationLayerStack,
} from '@flighthq/animation/contract';
