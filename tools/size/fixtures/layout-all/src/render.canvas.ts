import {
  createLayoutState,
  registerAnchorLayoutResolver,
  registerFlexLayoutResolver,
  registerGridLayoutResolver,
} from '@flighthq/layout';

const state = createLayoutState();
registerAnchorLayoutResolver(state);
registerFlexLayoutResolver(state);
registerGridLayoutResolver(state);
Reflect.set(globalThis, '__flightLayoutState', state);
