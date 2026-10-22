//! Provider-issued numeric host ids (D26 host vocabulary): the TS branded `number` identities a host
//! issues and alone interprets. Each is a `Copy` newtype that keeps its TS sentinel.

/// Opaque host buffer identity (TS branded `AudioBufferHandle`). Zero is the invalid sentinel.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioBufferHandle(pub i32);

/// Opaque host mixer-bus node identity (TS branded `AudioBusNodeHandle`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioBusNodeHandle(pub i32);

/// Opaque host device identity (TS branded `AudioDeviceHandle`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioDeviceHandle(pub i32);

/// Opaque host mixer graph identity (TS branded `AudioMixerGraphHandle`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioMixerGraphHandle(pub i32);

/// Opaque host source identity (TS branded `AudioSourceHandle`). Zero is the invalid sentinel.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct AudioSourceHandle(pub i32);

/// A pending app-loop frame request (TS `HostAppLoopCapability.requestFrame`'s handle; on the web the
/// `requestAnimationFrame` id). Zero is the no-request sentinel (the TS initial `null`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct FrameRequestHandle(pub i32);
