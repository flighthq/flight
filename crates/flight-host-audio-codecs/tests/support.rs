#![allow(dead_code)]

#[path = "generated_media.rs"]
mod generated_media;

use std::future::Future;
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_audio::AudioBuffer;
use flight_entity::{Ref, Uint8Array};
pub(crate) use generated_media::*;

use flight_host_audio_codecs::{
    AudioCodecsHost, AudioCodecsHostDecodeExplanation, AudioCodecsHostDecodeExplanationReason,
    create_audio_codecs_host,
};

pub(crate) fn assert_reason(
    explanation: &AudioCodecsHostDecodeExplanation,
    reason: AudioCodecsHostDecodeExplanationReason,
) {
    assert_eq!(explanation.reason, reason, "{}", explanation.message);
    if reason == AudioCodecsHostDecodeExplanationReason::Ready {
        assert!(explanation.message.is_empty());
    } else {
        assert!(!explanation.message.is_empty());
    }
}

pub(crate) fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => std::thread::yield_now(),
        }
    }
}

/// Runs `decode` on another thread and calls `interrupt` once that decode is under way: it holds
/// the byte handle's read lock and has had time to pass its entry checks. Returns its result.
pub(crate) fn interrupt_running_decode(
    bytes: Ref<Box<Uint8Array>>,
    decode: impl FnOnce(Ref<Box<Uint8Array>>) -> Option<Ref<AudioBuffer>> + Send + 'static,
    interrupt: impl FnOnce(),
) -> Option<Ref<AudioBuffer>> {
    let worker = std::thread::spawn({
        let bytes = bytes.clone();
        move || return decode(bytes)
    });
    while bytes.try_write().is_ok() {
        assert!(
            !worker.is_finished(),
            "the decode finished before it could be interrupted"
        );
        std::thread::yield_now();
    }
    std::thread::sleep(std::time::Duration::from_millis(10));
    assert!(
        !worker.is_finished(),
        "the decode finished before it could be interrupted"
    );
    interrupt();
    return worker.join().unwrap();
}

pub(crate) fn create_byte_handle(bytes: &[u8]) -> Ref<Box<Uint8Array>> {
    return Arc::new(RwLock::new(bytes.to_vec().into_boxed_slice()));
}

pub(crate) fn create_default_host() -> AudioCodecsHost {
    return create_audio_codecs_host(None).expect("default options are valid");
}

/// Copies one decoded channel out of its shared handle.
pub(crate) fn read_channel(buffer: &Ref<AudioBuffer>, channel: usize) -> Vec<f32> {
    let buffer = buffer.read().unwrap();
    return buffer.channels[channel].read().unwrap().to_vec();
}

pub(crate) fn read_layout(buffer: &Ref<AudioBuffer>) -> (usize, f32, usize) {
    let buffer = buffer.read().unwrap();
    for channel in buffer.channels.iter() {
        assert_eq!(channel.read().unwrap().len(), buffer.length);
    }
    return (buffer.channels.len(), buffer.sample_rate, buffer.length);
}
