// Generated from crates/flight-input/tests/input_binding_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { InputIngressSource, ProviderRef } from '@flighthq/host/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

import {
  attachGamepadInput,
  attachKeyboardInput,
  attachPointerInput,
  attachRelativePointerInput,
  attachTextInput,
  attachWheelInput,
  createInputManager,
  detachGamepadInput,
  detachKeyboardInput,
  detachPointerInput,
  detachRelativePointerInput,
  detachTextInput,
  detachWheelInput,
} from './contract.ts';
import type {
  AttachInputOptions,
  HostInputIngressCapability,
  InputIngressAttach,
  InputIngressRelease,
  InputIngressSink,
  InputKeyboardData,
} from './contract.ts';

interface Recorder {
  attachments: { value: Array<readonly [string, InputIngressSource]> };
  releases: { value: string[] };
  sinks: { value: InputIngressSink[] };
}

function createSource(): InputIngressSource {
  return { provider: identity(), handle: identity() };
}

function createRecorder(): Recorder {
  return { attachments: { value: [] as never[] }, releases: { value: [] as never[] }, sinks: { value: [] as never[] } };
}

function recordingHost(recorder: Recorder): HostInputIngressCapability {
  const attach = (kind: string): InputIngressAttach => {
    const recorded = recorder;
    return (
      source: Readonly<InputIngressSource>,
      sink: InputIngressSink,
      _options: Readonly<AttachInputOptions> | undefined,
    ) => {
      recorded.attachments.value.push([String(kind), source]);
      recorded.sinks.value.push(sink);
      const releases = recorded.releases;
      const release: InputIngressRelease = () => {
        releases.value.push(String(kind));
      };
      return release;
    };
  };
  return {
    provider: identity(),
    attachGamepad: attach('gamepad'),
    attachKeyboard: attach('keyboard'),
    attachPointer: attach('pointer'),
    attachRelativePointer: attach('relativePointer'),
    attachText: attach('text'),
    attachWheel: attach('wheel'),
  };
}

function keyboardData(keyCode: number): InputKeyboardData {
  return {
    altKey: false,
    capsLock: false,
    code: '',
    ctrlKey: false,
    key: '',
    keyCode: keyCode,
    location: 0,
    metaKey: false,
    modifier: 0,
    numLock: false,
    repeat: false,
    shiftKey: false,
    timeStamp: 0.0,
  };
}

function identity(): Readonly<number[]> {
  return [] as never[];
}

describe('attachGamepadInput', () => {
  it('binds the exact source through the ingress provider', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const source: InputIngressSource = createSource();
    attachGamepadInput(host, manager, source, undefined);
    const attachments = recorder.attachments.value;
    expect(attachments.length).toEqual(1);
    expect(attachments[0][0]).toEqual('gamepad');
    const attached: InputIngressSource = attachments[0][1];
    expect(attached.handle === source.handle).toBe(true);
  });
});

describe('attachKeyboardInput', () => {
  it('forwards normalized events and respects the enabled flag', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const events: { value: string[] } = { value: [] as never[] };
    const captured = events;
    connectSignal(manager!.onKeyDown, (_data: Readonly<InputKeyboardData>) => captured.value.push('key'), undefined);
    attachKeyboardInput(host, manager, createSource(), undefined);
    const sink = recorder.sinks.value[0];
    sink.keyDown(keyboardData(65));
    expect(events.value.length !== 0).toBe(true);
    manager!.enabled = false;
    sink.keyDown(keyboardData(65));
    expect(events.value.length).toEqual(1);
  });
});

describe('attachPointerInput', () => {
  it('reattaching the same source releases the old origin once', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const source = createSource();
    attachPointerInput(host, manager, source, undefined);
    attachPointerInput(host, manager, source, undefined);
    expect(recorder.releases.value).toEqual(['pointer']);
    detachPointerInput(manager, source);
    detachPointerInput(manager, source);
    expect(recorder.releases.value.length).toEqual(2);
  });
});

describe('attachRelativePointerInput', () => {
  it('binds relative pointer ingress', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    attachRelativePointerInput(host, createInputManager(), createSource(), undefined);
    expect(recorder.attachments.value[0][0]).toEqual('relativePointer');
  });
});

describe('attachTextInput', () => {
  it('binds text ingress', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    attachTextInput(host, createInputManager(), createSource(), undefined);
    expect(recorder.attachments.value[0][0]).toEqual('text');
  });
});

describe('attachWheelInput', () => {
  it('binds wheel ingress', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    attachWheelInput(host, createInputManager(), createSource(), undefined);
    expect(recorder.attachments.value[0][0]).toEqual('wheel');
  });
});

describe('detachGamepadInput', () => {
  it('releases the attachment', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const source = createSource();
    attachGamepadInput(host, manager, source, undefined);
    detachGamepadInput(manager, source);
    detachGamepadInput(manager, source);
    expect(recorder.releases.value).toEqual(['gamepad']);
  });
});

describe('detachKeyboardInput', () => {
  it('ends only its own binding', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const kept = createSource();
    const dropped = createSource();
    attachKeyboardInput(host, manager, kept, undefined);
    attachKeyboardInput(host, manager, dropped, undefined);
    detachKeyboardInput(manager, dropped);
    expect(recorder.releases.value.length).toEqual(1);
    detachKeyboardInput(manager, kept);
    expect(recorder.releases.value.length).toEqual(2);
  });
});

describe('detachPointerInput', () => {
  it('is idempotent when never attached', () => {
    const manager = createInputManager();
    detachPointerInput(manager, createSource());
    detachPointerInput(manager, createSource());
  });
});

describe('detachRelativePointerInput', () => {
  it('releases relative pointer ingress', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const source = createSource();
    attachRelativePointerInput(host, manager, source, undefined);
    detachRelativePointerInput(manager, source);
    expect(recorder.releases.value.length).toEqual(1);
  });
});

describe('detachTextInput', () => {
  it('releases text ingress', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const source = createSource();
    attachTextInput(host, manager, source, undefined);
    detachTextInput(manager, source);
    expect(recorder.releases.value.length).toEqual(1);
  });
});

describe('detachWheelInput', () => {
  it('releases wheel ingress', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const source = createSource();
    attachWheelInput(host, manager, source, undefined);
    detachWheelInput(manager, source);
    expect(recorder.releases.value.length).toEqual(1);
  });
});

describe('explicitInputIngressParameter', () => {
  it('passes each exact source identity through all six families and releases each once', () => {
    const recorder = createRecorder();
    const host = recordingHost(recorder);
    const manager = createInputManager();
    const sources = [createSource(), createSource(), createSource(), createSource(), createSource(), createSource()];
    attachGamepadInput(host, manager, sources[0], undefined);
    attachKeyboardInput(host, manager, sources[1], undefined);
    attachPointerInput(host, manager, sources[2], undefined);
    attachRelativePointerInput(host, manager, sources[3], undefined);
    attachTextInput(host, manager, sources[4], undefined);
    attachWheelInput(host, manager, sources[5], undefined);
    const attachments = recorder.attachments.value;
    expect(attachments.length).toEqual(6);
    for (let index = 0; index < attachments.length; index += 1) {
      const attached: InputIngressSource = attachments[index][1];
      const expected: InputIngressSource = sources[index];
      expect(attached.handle === expected.handle).toBe(true);
    }
    detachGamepadInput(manager, sources[0]);
    detachKeyboardInput(manager, sources[1]);
    detachPointerInput(manager, sources[2]);
    detachRelativePointerInput(manager, sources[3]);
    detachTextInput(manager, sources[4]);
    detachWheelInput(manager, sources[5]);
    detachGamepadInput(manager, sources[0]);
    detachKeyboardInput(manager, sources[1]);
    detachPointerInput(manager, sources[2]);
    detachRelativePointerInput(manager, sources[3]);
    detachTextInput(manager, sources[4]);
    detachWheelInput(manager, sources[5]);
    expect(recorder.releases.value.length).toEqual(6);
  });
});

describe('providerIdentity', () => {
  function hostWith(provider: ProviderRef, attach: InputIngressAttach): HostInputIngressCapability {
    return {
      provider: provider,
      attachGamepad: attach,
      attachKeyboard: attach,
      attachPointer: attach,
      attachRelativePointer: attach,
      attachText: attach,
      attachWheel: attach,
    };
  }
  it('facets from one provider share identity and distinct providers stay distinct', () => {
    const provider: ProviderRef = identity();
    const callback: InputIngressRelease = () => {};
    const attach: InputIngressAttach = (
      _source: Readonly<InputIngressSource>,
      _sink: InputIngressSink,
      _options: Readonly<AttachInputOptions> | undefined,
    ) => {
      return callback;
    };
    const first = hostWith(provider, attach);
    const second = hostWith(provider, attach);
    expect(first.provider === second.provider).toBe(true);
    expect(first.attachGamepad === second.attachGamepad).toBe(true);
    const other = hostWith(identity(), attach);
    expect(!(first.provider === other.provider)).toBe(true);
  });
});
