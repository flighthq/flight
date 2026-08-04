import { createLayoutState, registerAnchorLayoutResolver } from '@flighthq/layout';

const state = createLayoutState();
registerAnchorLayoutResolver(state);
Reflect.set(globalThis, '__flightLayoutState', state);
