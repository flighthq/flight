use flight_host::contract::*;

// Provider-issued ids are plain Copy numbers: equality is the id. Zero is the invalid sentinel of the
// audio buffer and source handles; a frame request id of zero is an ordinary issued id.
#[test]
fn equality_is_the_issued_id_and_zero_is_the_audio_sentinel() {
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
