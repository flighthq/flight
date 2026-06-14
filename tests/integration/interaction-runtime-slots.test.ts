import { createDisplayObject, getDisplayObjectRuntime } from '@flighthq/displayobject';
import { getInteractionSignals } from '@flighthq/interaction';

test('interaction signals are lazily attached to graph node runtime', () => {
  const obj = createDisplayObject();
  const runtime = getDisplayObjectRuntime(obj);

  expect(runtime.interactionSignals).toBeNull();

  const signals = getInteractionSignals(obj);
  expect(signals).not.toBeNull();
  expect(getInteractionSignals(obj)).toBe(signals);
  expect(getDisplayObjectRuntime(obj).interactionSignals).toBe(signals);
});
