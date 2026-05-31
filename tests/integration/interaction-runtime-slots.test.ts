import { getDisplayObjectInteractionSignals } from '@flighthq/interaction';
import { createDisplayObject, getDisplayObjectRuntime } from '@flighthq/scenegraph-display';

test('interaction signals are lazily attached to display object runtime', () => {
  const obj = createDisplayObject();
  const runtime = getDisplayObjectRuntime(obj);

  expect(runtime.interactionSignals).toBeNull();

  const signals = getDisplayObjectInteractionSignals(obj);
  expect(signals).not.toBeNull();
  expect(getDisplayObjectInteractionSignals(obj)).toBe(signals);
  expect(getDisplayObjectRuntime(obj).interactionSignals).toBe(signals);
});
