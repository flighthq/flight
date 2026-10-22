use flight_host::contract::*;

// Provider-issued ids are plain Copy numbers: equality is the id, and zero is the TS sentinel.
#[test]
fn zero_is_each_numeric_handles_sentinel_and_equality_is_the_issued_id() {
    let empty = AudioBufferHandle(0);
    assert_eq!(empty, AudioBufferHandle(0));
    assert_eq!(AudioSourceHandle(0).0, 0);
    assert_eq!(FrameRequestHandle(0), FrameRequestHandle(0));
    let issued = AudioDeviceHandle(4);
    let copy = issued;
    assert_eq!(copy, issued);
    assert_ne!(AudioBusNodeHandle(1), AudioBusNodeHandle(2));
    assert_eq!(AudioMixerGraphHandle(3).0, 3);
    assert_ne!(FrameRequestHandle(5), FrameRequestHandle(0));
}
