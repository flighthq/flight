import { createSignalScope } from './scope.ts';
import { createSignal } from './signal.ts';
import type { Signal, SignalScope } from './signalTypes.ts';

describe('Signal public types', () => {
  it('parameterizes a signal by its payload', () => {
    const signal: Signal<{ x: number; y: number }> = createSignal();

    signal.emit({ x: 1, y: 2 });
    expect(signal.data).toBeUndefined();
  });

  it('aliases the generated signal-scope representation', () => {
    const scope: SignalScope = createSignalScope();

    expect(scope.connections).toEqual([]);
  });
});
