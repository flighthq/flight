import { createAppWindow, getWindowBounds, openWindow, setWindowTitle } from '@flighthq/app';
import { webHost } from '@flighthq/host-web';

import { renderHostWebFullCard } from './render.canvas.ts';

const applicationWindow = createAppWindow();
// The aggregate window group is a struct of capability leaves; the ones this card uses are typed
// required, so a host that omitted one would be a compile error here rather than a runtime guard.
const { appearance, geometry, lifecycle } = webHost.window;
const opened = openWindow(lifecycle, geometry, applicationWindow, {
  height: window.innerHeight,
  title: 'Flight Web Host',
  width: window.innerWidth,
});

setWindowTitle(appearance, applicationWindow, 'Flight Web Host');

const bounds = getWindowBounds(geometry, applicationWindow, { height: 0, width: 0, x: 0, y: 0 });
const card = renderHostWebFullCard(applicationWindow, bounds, opened);

Reflect.set(globalThis, '__flightHostWebFull', card);
