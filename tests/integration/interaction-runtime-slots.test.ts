import { createDisplayObject, getDisplayObjectRuntime } from '@flighthq/displayobject';
import { enableInteractionSignals, getInteractionSignals } from '@flighthq/interaction';

test('interaction signals are lazily attached to graph node runtime', () => {
  const obj = createDisplayObject();
  const runtime = getDisplayObjectRuntime(obj);

  expect(runtime.interactionSignals).toBeNull();
  expect(getInteractionSignals(obj)).toBeNull();

  const signals = enableInteractionSignals(obj);
  expect(signals).not.toBeNull();
  expect(getInteractionSignals(obj)).toBe(signals);
  expect(getDisplayObjectRuntime(obj).interactionSignals).toBe(signals);
});
