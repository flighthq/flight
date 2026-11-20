#![allow(dead_code)]

use std::future::Future;
use std::sync::{Arc, RwLock};
use std::task::{Context, Poll, Waker};

use flight_audio::AudioBuffer;
use flight_entity::{Ref, Uint8Array};
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

/// A RIFF/WAVE file with a plain `fmt ` chunk (format tag, channels, rate, bits) and the given
/// interleaved little-endian sample bytes. `declared_data_length` overrides the data chunk size.
pub(crate) fn encode_wav(
    format_tag: u16,
    channels: u16,
    sample_rate: u32,
    bits_per_sample: u16,
    data: &[u8],
    declared_data_length: Option<u32>,
) -> Vec<u8> {
    let block_align = channels * bits_per_sample.div_ceil(8);
    let mut fmt = Vec::new();
    fmt.extend_from_slice(&format_tag.to_le_bytes());
    fmt.extend_from_slice(&channels.to_le_bytes());
    fmt.extend_from_slice(&sample_rate.to_le_bytes());
    fmt.extend_from_slice(&(sample_rate * u32::from(block_align)).to_le_bytes());
    fmt.extend_from_slice(&block_align.to_le_bytes());
    fmt.extend_from_slice(&bits_per_sample.to_le_bytes());
    return encode_riff_wave(&fmt, data, declared_data_length);
}

/// A WAVE_FORMAT_EXTENSIBLE file whose sub-format is integer PCM.
pub(crate) fn encode_wav_extensible_pcm(
    channels: u16,
    sample_rate: u32,
    bits_per_sample: u16,
    channel_mask: u32,
    data: &[u8],
) -> Vec<u8> {
    let block_align = channels * bits_per_sample.div_ceil(8);
    let mut fmt = Vec::new();
    fmt.extend_from_slice(&0xfffe_u16.to_le_bytes());
    fmt.extend_from_slice(&channels.to_le_bytes());
    fmt.extend_from_slice(&sample_rate.to_le_bytes());
    fmt.extend_from_slice(&(sample_rate * u32::from(block_align)).to_le_bytes());
    fmt.extend_from_slice(&block_align.to_le_bytes());
    fmt.extend_from_slice(&bits_per_sample.to_le_bytes());
    fmt.extend_from_slice(&22_u16.to_le_bytes());
    fmt.extend_from_slice(&bits_per_sample.to_le_bytes());
    fmt.extend_from_slice(&channel_mask.to_le_bytes());
    fmt.extend_from_slice(&[
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b,
        0x71,
    ]);
    return encode_riff_wave(&fmt, data, None);
}

fn encode_riff_wave(fmt: &[u8], data: &[u8], declared_data_length: Option<u32>) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"RIFF");
    let riff_length = 4 + 8 + fmt.len() + 8 + data.len();
    bytes.extend_from_slice(&(riff_length as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&(fmt.len() as u32).to_le_bytes());
    bytes.extend_from_slice(fmt);
    bytes.extend_from_slice(b"data");
    let data_length = declared_data_length.unwrap_or(data.len() as u32);
    bytes.extend_from_slice(&data_length.to_le_bytes());
    bytes.extend_from_slice(data);
    return bytes;
}

pub(crate) fn interleave_i16(samples: &[i16]) -> Vec<u8> {
    return samples
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
}

/// How one channel of every generated Vorbis audio packet is coded.
#[derive(Clone, Copy, Debug)]
pub(crate) enum VorbisChannelContent {
    /// The floor is unused, so the channel decodes to exact silence.
    Silent,
    /// One spectral line at `bin` (0..128) with the given floor level (0..=255).
    Tone { bin: usize, level: u8 },
}

/// Shape of a generated Ogg Vorbis stream. Every packet uses one 256-sample short block, so each
/// audio packet after the first adds 128 frames before end trimming.
#[derive(Clone, Debug)]
pub(crate) struct VorbisStreamShape {
    pub(crate) audio_packets: usize,
    pub(crate) channels: Vec<VorbisChannelContent>,
    /// Granule position written on the final page; `None` writes the untrimmed frame count.
    pub(crate) final_granule: Option<u64>,
    /// Places every audio packet on one page instead of one page per packet.
    pub(crate) single_audio_page: bool,
    pub(crate) sample_rate: u32,
}

pub(crate) fn create_vorbis_stream_shape(channels: Vec<VorbisChannelContent>) -> VorbisStreamShape {
    return VorbisStreamShape {
        audio_packets: 9,
        channels,
        final_granule: None,
        single_audio_page: false,
        sample_rate: 22_050,
    };
}

/// The frames a generated stream decodes to before granule trimming.
pub(crate) fn get_vorbis_stream_untrimmed_frames(shape: &VorbisStreamShape) -> u64 {
    return (shape.audio_packets as u64 - 1) * 128;
}

/// Encodes a minimal, valid Ogg Vorbis I stream: identification, comment and setup headers then
/// short-block audio packets coded with a two-point floor and a three-value residue codebook.
pub(crate) fn encode_ogg_vorbis(shape: &VorbisStreamShape) -> Vec<u8> {
    let channels = shape.channels.len() as u8;
    let ident = encode_vorbis_identification_header(channels, shape.sample_rate);
    let comment = encode_vorbis_comment_header();
    let setup = encode_vorbis_setup_header();
    let mut stream = OggStreamWriter::new(0x5eed_0001);
    stream.write_page(&[&ident], 0, OGG_FIRST_PAGE);
    stream.write_page(&[&comment, &setup], 0, 0);
    let packets: Vec<Vec<u8>> = (0..shape.audio_packets)
        .map(|_| return encode_vorbis_audio_packet(&shape.channels))
        .collect();
    let untrimmed = get_vorbis_stream_untrimmed_frames(shape);
    let final_granule = shape.final_granule.unwrap_or(untrimmed);
    if shape.single_audio_page {
        let refs: Vec<&[u8]> = packets.iter().map(Vec::as_slice).collect();
        stream.write_page(&refs, final_granule, OGG_LAST_PAGE);
    } else {
        for (index, packet) in packets.iter().enumerate() {
            let last = index + 1 == packets.len();
            let granule = if last {
                final_granule
            } else {
                index as u64 * 128
            };
            stream.write_page(&[packet], granule, if last { OGG_LAST_PAGE } else { 0 });
        }
    }
    return stream.bytes;
}

/// A first page whose identification packet names another codec, as an Ogg Opus file does.
pub(crate) fn encode_ogg_with_foreign_codec() -> Vec<u8> {
    let mut head = b"OpusHead".to_vec();
    head.extend_from_slice(&[1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]);
    let mut stream = OggStreamWriter::new(7);
    stream.write_page(&[&head], 0, OGG_FIRST_PAGE | OGG_LAST_PAGE);
    return stream.bytes;
}

/// A setup header whose single codebook declares 2^24 - 1 entries of 65,535 dimensions with a
/// lookup table, packed in a few bytes by the ordered-length form.
pub(crate) fn encode_ogg_vorbis_with_oversized_codebook() -> Vec<u8> {
    let ident = encode_vorbis_identification_header(1, 22_050);
    let comment = encode_vorbis_comment_header();
    let mut bits = BitWriter::default();
    bits.write_bytes(b"\x05vorbis");
    bits.write(0, 8);
    bits.write(0x56_43_42, 24);
    bits.write(0xffff, 16);
    bits.write(0xff_ffff, 24);
    bits.write(1, 1);
    bits.write(0, 5);
    // One run covers every entry at length 1, so the length section stays tiny.
    bits.write(0xff_ffff, 24);
    bits.write(1, 4);
    bits.write(encode_vorbis_float(-1.0), 32);
    bits.write(encode_vorbis_float(1.0), 32);
    bits.write(0, 4);
    bits.write(0, 1);
    bits.write(0, 8);
    let setup = bits.bytes;
    let mut stream = OggStreamWriter::new(3);
    stream.write_page(&[&ident], 0, OGG_FIRST_PAGE);
    stream.write_page(&[&comment, &setup], 0, OGG_LAST_PAGE);
    return stream.bytes;
}

fn encode_vorbis_audio_packet(channels: &[VorbisChannelContent]) -> Vec<u8> {
    let mut bits = BitWriter::default();
    bits.write(0, 1);
    for content in channels {
        match content {
            VorbisChannelContent::Silent => bits.write(0, 1),
            VorbisChannelContent::Tone { level, .. } => {
                bits.write(1, 1);
                bits.write(u64::from(*level), 8);
                bits.write(u64::from(*level), 8);
            }
        }
    }
    // Residue: four 32-line partitions, each a class codeword then 32 value codewords per active
    // channel, in channel order.
    for partition in 0..4 {
        for content in channels {
            if let VorbisChannelContent::Tone { .. } = content {
                bits.write_codeword(CLASS_BOOK_CODEWORDS[0]);
            }
        }
        for content in channels {
            if let VorbisChannelContent::Tone { bin, .. } = content {
                for line in partition * 32..(partition + 1) * 32 {
                    let entry = if line == *bin { 2 } else { 1 };
                    bits.write_codeword(VALUE_BOOK_CODEWORDS[entry]);
                }
            }
        }
    }
    return bits.bytes;
}

fn encode_vorbis_comment_header() -> Vec<u8> {
    let mut bits = BitWriter::default();
    bits.write_bytes(b"\x03vorbis");
    let vendor = b"flight test stream";
    bits.write_bytes(&(vendor.len() as u32).to_le_bytes());
    bits.write_bytes(vendor);
    bits.write_bytes(&0_u32.to_le_bytes());
    bits.write(1, 1);
    return bits.bytes;
}

/// Vorbis's packed float: 21-bit mantissa, 10-bit exponent biased by 788, sign in the top bit.
fn encode_vorbis_float(value: f32) -> u64 {
    assert!(value == 1.0 || value == -1.0);
    let sign = if value < 0.0 { 1_u64 << 31 } else { 0 };
    return sign | (788 << 21) | 1;
}

fn encode_vorbis_identification_header(channels: u8, sample_rate: u32) -> Vec<u8> {
    let mut bits = BitWriter::default();
    bits.write_bytes(b"\x01vorbis");
    bits.write_bytes(&0_u32.to_le_bytes());
    bits.write_bytes(&[channels]);
    bits.write_bytes(&sample_rate.to_le_bytes());
    bits.write_bytes(&[0; 12]);
    // Both block sizes are 2^8 samples.
    bits.write_bytes(&[0x88]);
    bits.write(1, 1);
    return bits.bytes;
}

fn encode_vorbis_setup_header() -> Vec<u8> {
    let mut bits = BitWriter::default();
    bits.write_bytes(b"\x05vorbis");
    bits.write(1, 8);
    // Codebook 0 classifies residue partitions: one dimension, two one-bit entries.
    bits.write(0x56_43_42, 24);
    bits.write(1, 16);
    bits.write(2, 24);
    bits.write(0, 1);
    bits.write(0, 1);
    bits.write(0, 5);
    bits.write(0, 5);
    bits.write(0, 4);
    // Codebook 1 codes residue lines as -1, 0 or +1 with lengths 2, 1, 2.
    bits.write(0x56_43_42, 24);
    bits.write(1, 16);
    bits.write(3, 24);
    bits.write(0, 1);
    bits.write(0, 1);
    bits.write(1, 5);
    bits.write(0, 5);
    bits.write(1, 5);
    bits.write(1, 4);
    bits.write(encode_vorbis_float(-1.0), 32);
    bits.write(encode_vorbis_float(1.0), 32);
    bits.write(1, 4);
    bits.write(0, 1);
    for multiplicand in 0..3 {
        bits.write(multiplicand, 2);
    }
    // One unused time-domain transform.
    bits.write(0, 6);
    bits.write(0, 16);
    // One type-1 floor: X list 0, 128 and an interpolated point at 64.
    bits.write(0, 6);
    bits.write(1, 16);
    bits.write(1, 5);
    bits.write(0, 4);
    bits.write(0, 3);
    bits.write(0, 2);
    bits.write(0, 8);
    bits.write(0, 2);
    bits.write(7, 4);
    bits.write(64, 7);
    // One type-1 residue over lines 0..128 in 32-line partitions with two classes.
    bits.write(0, 6);
    bits.write(1, 16);
    bits.write(0, 24);
    bits.write(128, 24);
    bits.write(31, 24);
    bits.write(1, 6);
    bits.write(0, 8);
    bits.write(1, 3);
    bits.write(0, 1);
    bits.write(0, 3);
    bits.write(0, 1);
    bits.write(1, 8);
    // One mapping with one submap and no coupling.
    bits.write(0, 6);
    bits.write(0, 16);
    bits.write(0, 1);
    bits.write(0, 1);
    bits.write(0, 2);
    bits.write(0, 8);
    bits.write(0, 8);
    bits.write(0, 8);
    // One short-block mode.
    bits.write(0, 6);
    bits.write(0, 1);
    bits.write(0, 16);
    bits.write(0, 16);
    bits.write(0, 8);
    bits.write(1, 1);
    return bits.bytes;
}

#[derive(Default)]
struct BitWriter {
    bit: usize,
    bytes: Vec<u8>,
}

impl BitWriter {
    fn write(&mut self, value: u64, count: u32) {
        for offset in 0..count {
            if self.bit.is_multiple_of(8) {
                self.bytes.push(0);
            }
            if (value >> offset) & 1 == 1 {
                *self.bytes.last_mut().unwrap() |= 1 << (self.bit % 8);
            }
            self.bit += 1;
        }
    }

    fn write_bytes(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.write(u64::from(*byte), 8);
        }
    }

    /// Huffman codewords are read one bit at a time, first bit first.
    fn write_codeword(&mut self, codeword: &str) {
        for bit in codeword.chars() {
            self.write(u64::from(bit == '1'), 1);
        }
    }
}

struct OggStreamWriter {
    bytes: Vec<u8>,
    sequence: u32,
    serial: u32,
}

impl OggStreamWriter {
    fn new(serial: u32) -> Self {
        return Self {
            bytes: Vec::new(),
            sequence: 0,
            serial,
        };
    }

    fn write_page(&mut self, packets: &[&[u8]], granule: u64, flags: u8) {
        let mut lacing = Vec::new();
        let mut body = Vec::new();
        for packet in packets {
            let mut remaining = packet.len();
            while remaining >= 255 {
                lacing.push(255);
                remaining -= 255;
            }
            lacing.push(remaining as u8);
            body.extend_from_slice(packet);
        }
        let mut page = Vec::new();
        page.extend_from_slice(b"OggS");
        page.push(0);
        page.push(flags);
        page.extend_from_slice(&granule.to_le_bytes());
        page.extend_from_slice(&self.serial.to_le_bytes());
        page.extend_from_slice(&self.sequence.to_le_bytes());
        page.extend_from_slice(&[0; 4]);
        page.push(lacing.len() as u8);
        page.extend_from_slice(&lacing);
        page.extend_from_slice(&body);
        let crc = compute_ogg_crc(&page);
        page[22..26].copy_from_slice(&crc.to_le_bytes());
        self.bytes.extend_from_slice(&page);
        self.sequence += 1;
    }
}

/// Ogg's page checksum: CRC-32 with polynomial 0x04c11db7, zero initial value, no reflection.
fn compute_ogg_crc(bytes: &[u8]) -> u32 {
    let mut crc: u32 = 0;
    for byte in bytes {
        crc ^= u32::from(*byte) << 24;
        for _ in 0..8 {
            crc = if crc & 0x8000_0000 != 0 {
                (crc << 1) ^ 0x04c1_1db7
            } else {
                crc << 1
            };
        }
    }
    return crc;
}

/// Byte offsets where each Ogg page of `bytes` starts.
pub(crate) fn find_ogg_page_offsets(bytes: &[u8]) -> Vec<usize> {
    return (0..bytes.len().saturating_sub(3))
        .filter(|&offset| return &bytes[offset..offset + 4] == b"OggS")
        .collect();
}

const CLASS_BOOK_CODEWORDS: [&str; 2] = ["0", "1"];
const OGG_FIRST_PAGE: u8 = 0x02;
const OGG_LAST_PAGE: u8 = 0x04;
/// Entry codewords for lengths 2, 1, 2 in entry order: each takes the lowest free codeword.
const VALUE_BOOK_CODEWORDS: [&str; 3] = ["00", "1", "01"];
