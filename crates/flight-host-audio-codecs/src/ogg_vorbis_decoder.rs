use std::io::Cursor;

use flight_audio::AudioBuffer;
use flight_entity::Ref;
use lewton::audio::{AudioReadError, PreviousWindowRight, read_audio_packet_generic};
use lewton::header::{
    HeaderReadError, IdentHeader, SetupHeader, read_header_ident, read_header_setup,
};
use ogg::{OggReadError, Packet, PacketReader};

use crate::decoded_audio::{
    DecodeFailure, DecodeWatch, check_decode_watch, create_decode_failure,
    create_decoded_audio_buffer, no_audio_frames, validate_decoded_layout,
    validate_decoded_sample_count,
};
use crate::types::{AudioCodecsHostDecodeExplanationReason, AudioCodecsHostOptions};

// The contract file-structure rule requires modules before functions.
#[allow(clippy::items_after_test_module)]
#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicBool;

    use super::*;
    use crate::audio_codecs_host::{
        create_audio_codecs_host, create_audio_codecs_host_options,
        explain_audio_codecs_host_decode,
    };
    use crate::generated_media::{
        VorbisChannelContent, create_vorbis_stream_shape, encode_ogg_vorbis,
        encode_ogg_vorbis_with_setup_packet, encode_ogg_vorbis_with_single_codebook,
        encode_vorbis_setup_with_single_codebook,
    };
    use crate::types::AudioCodecsHostState;

    fn decode_counting_setup_parses(
        bytes: &[u8],
    ) -> (AudioCodecsHostDecodeExplanationReason, usize) {
        let state = AudioCodecsHostState {
            alive: AtomicBool::new(true),
        };
        let watch = DecodeWatch {
            signal: None,
            state: &state,
        };
        VORBIS_SETUP_PARSES.with(|count| count.set(0));
        let reason = match decode_ogg_vorbis(&create_audio_codecs_host_options(), bytes, &watch) {
            Ok(_) => AudioCodecsHostDecodeExplanationReason::Ready,
            Err(failure) => failure.reason,
        };
        return (reason, VORBIS_SETUP_PARSES.with(|count| return count.get()));
    }

    fn scan_reason(
        dimensions: u16,
        entries: u32,
        lookup_type: u8,
    ) -> AudioCodecsHostDecodeExplanationReason {
        let packet = encode_vorbis_setup_with_single_codebook(dimensions, entries, lookup_type);
        return match scan_vorbis_codebook_tables(&packet) {
            Ok(()) => AudioCodecsHostDecodeExplanationReason::Ready,
            Err(failure) => failure.reason,
        };
    }

    #[test]
    fn codebook_tables_over_the_bound_never_reach_the_backing_parser() {
        let over = encode_ogg_vorbis_with_single_codebook(1, (1 << 22) + 1, 0);
        assert_eq!(
            decode_counting_setup_parses(&over),
            (
                AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
                0
            )
        );
        let tone = VorbisChannelContent::Tone { bin: 4, level: 230 };
        let valid = encode_ogg_vorbis(&create_vorbis_stream_shape(vec![tone]));
        assert_eq!(
            decode_counting_setup_parses(&valid),
            (AudioCodecsHostDecodeExplanationReason::Ready, 1)
        );
    }

    #[test]
    fn entries_alone_are_bounded_at_the_table_limit() {
        assert_eq!(
            scan_reason(1, 1 << 22, 0),
            AudioCodecsHostDecodeExplanationReason::Ready
        );
        assert_eq!(
            scan_reason(1, (1 << 22) + 1, 0),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded
        );
    }

    #[test]
    fn lookup_tables_count_entries_times_dimensions_at_the_limit() {
        // 1,398,101 entries of two dimensions hold 3 * 1,398,101 = 4,194,303 table values.
        assert_eq!(
            scan_reason(2, 1_398_101, 1),
            AudioCodecsHostDecodeExplanationReason::Ready
        );
        assert_eq!(
            scan_reason(2, 1_398_102, 1),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded
        );
        assert_eq!(
            scan_reason(0xffff, 0xff_ffff, 1),
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded
        );
    }

    #[test]
    fn lookup1_value_counts_are_exact_integer_roots() {
        let cases = [
            (3, 1, 3),
            (1_024, 10, 2),
            (1_023, 10, 1),
            (3_125, 5, 5),
            (3_124, 5, 4),
            (0xff_ffff, 0xffff, 1),
            (1_398_101, 2, 1_182),
        ];
        for (entries, dimensions, expected) in cases {
            assert_eq!(
                get_vorbis_lookup1_value_count(entries, dimensions),
                expected
            );
        }
    }

    // The setup packet of `encode_vorbis_setup_with_single_codebook(1, 66, 1)` holds 158 bits of
    // codebook fields and then 66 one-bit lookup values: the values end exactly at bit 224, the
    // last bit of the 28th byte after the 7-byte packet prefix, so a packet cut there leaves no
    // bit to spare.
    const LOOKUP_VALUES_END_BYTES: usize = 7 + 28;

    fn lookup_values_setup_packet() -> Vec<u8> {
        let packet = encode_vorbis_setup_with_single_codebook(1, 66, 1);
        assert!(packet.len() > LOOKUP_VALUES_END_BYTES);
        return packet;
    }

    // The exact bit count of `byte_count` bytes less `position`, computed in u128 so it never
    // shares the arithmetic under test; `None` where the count leaves u64.
    fn exact_remaining_bits(byte_count: u64, position: u64) -> Option<u64> {
        let bit_count = u128::from(byte_count) * 8;
        let remaining = bit_count.saturating_sub(u128::from(position));
        return u64::try_from(bit_count)
            .ok()
            .map(|_| return remaining as u64);
    }

    #[test]
    fn lifted_encoded_caps_reject_an_overrunning_setup_before_the_backing_parser() {
        let stream = encode_ogg_vorbis_with_setup_packet(
            &lookup_values_setup_packet()[..LOOKUP_VALUES_END_BYTES - 1],
        );
        let caps = [
            usize::MAX / 8,
            usize::MAX / 8 + 1,
            usize::MAX,
            usize::try_from(u64::from(u32::MAX)).unwrap_or(usize::MAX),
            usize::try_from(u64::from(u32::MAX) + 1).unwrap_or(usize::MAX),
        ];
        for max_encoded_bytes in caps {
            let options = AudioCodecsHostOptions {
                max_encoded_bytes,
                ..create_audio_codecs_host_options()
            };
            let host = create_audio_codecs_host(Some(&options))
                .expect("a nonzero max_encoded_bytes is valid at any width");
            VORBIS_SETUP_PARSES.with(|count| count.set(0));
            let explanation = explain_audio_codecs_host_decode(&host, &stream, "audio/ogg", None);
            assert_eq!(
                (
                    explanation.reason,
                    VORBIS_SETUP_PARSES.with(|count| return count.get())
                ),
                (AudioCodecsHostDecodeExplanationReason::MalformedInput, 0),
                "max_encoded_bytes {max_encoded_bytes}"
            );
        }
    }

    #[test]
    fn lookup_values_that_end_at_the_packet_end_fit_and_one_byte_less_does_not() {
        let packet = lookup_values_setup_packet();
        assert!(scan_vorbis_codebook_tables(&packet[..LOOKUP_VALUES_END_BYTES]).is_ok());
        assert_eq!(
            scan_vorbis_codebook_tables(&packet[..LOOKUP_VALUES_END_BYTES - 1])
                .map_err(|failure| return failure.reason),
            Err(AudioCodecsHostDecodeExplanationReason::MalformedInput)
        );
    }

    #[test]
    fn setup_bit_reads_past_any_addressable_byte_fail_closed() {
        for position in [8, u64::from(u32::MAX) * 8, 1 << 35, u64::MAX - 7, u64::MAX] {
            let mut bits = SetupBits {
                bytes: &[0xff],
                position,
            };
            assert_eq!(
                read_setup_bits(&mut bits, 1).map_err(|failure| return failure.reason),
                Err(AudioCodecsHostDecodeExplanationReason::MalformedInput),
                "position {position}"
            );
        }
        let mut last = SetupBits {
            bytes: &[0x80],
            position: 7,
        };
        assert_eq!(read_setup_bits(&mut last, 1).ok(), Some(1));
    }

    // 2^61 bytes is the first length whose bit count leaves u64, and still below the 2^63 - 1
    // bytes a 64-bit slice may span, so the scan must refuse it before the backing parser.
    #[cfg(target_pointer_width = "64")]
    #[test]
    fn setup_bit_budget_refuses_the_first_length_whose_bits_leave_u64_before_the_backing_parser() {
        let below = usize::try_from((1_u64 << 61) - 1).unwrap();
        let first_unaddressable = usize::try_from(1_u64 << 61).unwrap();
        let bit_total = u64::try_from(below).unwrap() * 8;
        VORBIS_SETUP_PARSES.with(|count| count.set(0));
        let budget = |byte_count, position| {
            return get_vorbis_setup_remaining_bit_budget(byte_count, position)
                .map_err(|failure| return failure.reason);
        };
        assert_eq!(budget(below, 0), Ok(bit_total));
        assert_eq!(budget(below, bit_total - 1), Ok(1));
        assert_eq!(budget(below, bit_total), Ok(0));
        assert_eq!(budget(below, bit_total + 1), Ok(0));
        assert_eq!(budget(below, u64::MAX), Ok(0));
        for byte_count in [first_unaddressable, first_unaddressable + 1, usize::MAX] {
            for position in [0, bit_total, u64::MAX] {
                assert_eq!(
                    budget(byte_count, position),
                    Err(AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded),
                    "{byte_count} bytes at bit {position}"
                );
            }
        }
        assert_eq!(VORBIS_SETUP_PARSES.with(|count| return count.get()), 0);
    }

    #[test]
    fn setup_remaining_bits_widen_every_usize_byte_count_before_multiplying() {
        let cases = [
            (0, 0),
            (1, 3),
            (usize::MAX / 8, 0),
            (usize::MAX / 8, u64::MAX),
            (usize::MAX / 8 + 1, 0),
            (usize::MAX / 8 + 1, 1),
            (usize::MAX - 1, 0),
            (usize::MAX, 0),
            (usize::MAX, u64::MAX),
        ];
        for (byte_count, position) in cases {
            let widened = u64::try_from(byte_count).unwrap();
            assert_eq!(
                get_vorbis_setup_remaining_bits(byte_count, position),
                exact_remaining_bits(widened, position),
                "{byte_count} bytes at bit {position}"
            );
        }
    }

    #[test]
    fn setup_remaining_bits_are_exact_at_every_width_limit() {
        let u64_byte_limit = u64::MAX / 8;
        let u32_bit_limit_bytes = (u64::from(u32::MAX) + 1) / 8;
        let usize_byte_limit = u64::try_from(usize::MAX / 8).unwrap();
        let usize_max = u64::try_from(usize::MAX).unwrap();
        let cases = [
            (0, 0),
            (1, 0),
            (1, 7),
            (1, 8),
            (1, 9),
            (1, u64::MAX),
            (u32_bit_limit_bytes - 1, 0),
            (u32_bit_limit_bytes, 0),
            (u32_bit_limit_bytes, 1 << 32),
            (u32_bit_limit_bytes + 1, (1 << 32) - 1),
            (usize_byte_limit, 0),
            (usize_byte_limit + 1, 0),
            (usize_max, 0),
            (u64_byte_limit, 0),
            (u64_byte_limit, u64::MAX),
            (u64_byte_limit + 1, 0),
            (u64::MAX, 0),
        ];
        for (byte_count, position) in cases {
            assert_eq!(
                get_vorbis_setup_remaining_bits_in_u64(byte_count, position),
                exact_remaining_bits(byte_count, position),
                "{byte_count} bytes at bit {position}"
            );
        }
        assert_eq!(
            get_vorbis_setup_remaining_bits_in_u64(u64_byte_limit, 0),
            Some(u64::MAX - 7)
        );
        assert_eq!(
            get_vorbis_setup_remaining_bits_in_u64(u64_byte_limit + 1, 0),
            None
        );
        assert_eq!(
            get_vorbis_setup_remaining_bits_in_u64(u32_bit_limit_bytes, 0),
            Some(1 << 32)
        );
    }
}

/// A little-endian bit cursor over a Vorbis setup header, as the Vorbis bitstream packs fields
/// from the least significant bit of each byte. The position counts bits in u64, so a header of
/// any addressable length has a bit position that cannot wrap on any pointer width.
struct SetupBits<'a> {
    bytes: &'a [u8],
    position: u64,
}

/// Codebook entries plus lookup-table values summed over every codebook of one setup header. Real
/// encoders stay far below it; it caps the decoder's table memory at a few tens of MiB.
const OGG_CAPTURE_PATTERN: &[u8] = b"OggS";

const OGG_PAGE_HEADER_LENGTH: usize = 27;

const MAX_VORBIS_CODEBOOK_TABLE_VALUES: u64 = 1 << 22;

const VORBIS_CODEBOOK_SYNC: u64 = 0x56_43_42;

const VORBIS_COMMENT_HEADER_PREFIX: &[u8] = b"\x03vorbis";

const VORBIS_SETUP_HEADER_PREFIX: &[u8] = b"\x05vorbis";

fn codebook_tables_too_large() -> DecodeFailure {
    return create_decode_failure(
        AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
        "the Vorbis codebook tables exceed the decoder's table bound",
    );
}

/// Decodes the first Vorbis logical stream of an Ogg file to planar float samples. Packets of
/// other logical streams are skipped, and decoding ends at the stream's last packet. The final
/// packet is trimmed to its page's granule position, as Vorbis prescribes for the stream end.
pub(crate) fn decode_ogg_vorbis(
    options: &AudioCodecsHostOptions,
    bytes: &[u8],
    watch: &DecodeWatch<'_>,
) -> Result<Ref<AudioBuffer>, DecodeFailure> {
    let failure = |error: OggReadError| return map_ogg_error(bytes, error);
    let mut reader = PacketReader::new(Cursor::new(bytes));
    let Some(ident_packet) = reader.read_packet().map_err(failure)? else {
        return Err(missing_header());
    };
    let ident = read_header_ident(&ident_packet.data).map_err(map_ident_error)?;
    let serial = ident_packet.stream_serial();
    let channels = usize::from(ident.audio_channels);
    validate_decoded_layout(options, channels, ident.audio_sample_rate)?;
    let comment_packet =
        read_stream_packet(&mut reader, serial, bytes)?.ok_or_else(missing_header)?;
    if !comment_packet
        .data
        .starts_with(VORBIS_COMMENT_HEADER_PREFIX)
    {
        return Err(malformed("second Vorbis packet is not a comment header"));
    }
    let setup_packet =
        read_stream_packet(&mut reader, serial, bytes)?.ok_or_else(missing_header)?;
    scan_vorbis_codebook_tables(&setup_packet.data)?;
    let setup = open_vorbis_setup(&setup_packet.data, &ident).map_err(map_setup_error)?;
    let mut window = PreviousWindowRight::new();
    let mut planar: Vec<Vec<f32>> = (0..channels).map(|_| return Vec::new()).collect();
    let mut frames: usize = 0;
    let mut previous_granule: Option<u64> = None;
    loop {
        check_decode_watch(watch)?;
        let Some(packet) = read_stream_packet(&mut reader, serial, bytes)? else {
            break;
        };
        let decoded: Vec<Vec<f32>> = if packet.data.is_empty() {
            Vec::new()
        } else {
            read_audio_packet_generic(&ident, &setup, &packet.data, &mut window)
                .map_err(map_audio_error)?
        };
        let mut count = decoded.first().map_or(0, Vec::len);
        if packet.last_in_stream()
            && let Some(granule) = previous_granule
        {
            let remaining = packet.absgp_page().saturating_sub(granule);
            count = count.min(usize::try_from(remaining).unwrap_or(usize::MAX));
        }
        if packet.last_in_page() {
            previous_granule = Some(packet.absgp_page());
        } else if let Some(granule) = previous_granule.as_mut() {
            *granule = granule.saturating_add(count as u64);
        }
        if count > 0 {
            let total = frames.saturating_add(count);
            validate_decoded_sample_count(options, channels, total)?;
            for (channel, samples) in planar.iter_mut().zip(decoded.iter()) {
                channel.extend_from_slice(&samples[..count]);
            }
            frames = total;
        }
        if packet.last_in_stream() {
            break;
        }
    }
    if frames == 0 {
        return Err(no_audio_frames());
    }
    return Ok(create_decoded_audio_buffer(ident.audio_sample_rate, planar));
}

/// The number of `[value]` entries a lookup-type-1 codebook stores: the largest integer whose
/// `dimensions`-th power does not exceed `entries`.
fn get_vorbis_lookup1_value_count(entries: u64, dimensions: u32) -> u64 {
    let fits = |count: u64| {
        return count
            .checked_pow(dimensions)
            .is_some_and(|power| power <= entries);
    };
    let mut low: u64 = 0;
    let mut high: u64 = entries.max(1);
    while low < high {
        let middle = low + (high - low).div_ceil(2);
        if fits(middle) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    return low;
}

/// Bits left after `position` in a Vorbis setup header of `byte_count` bytes, or `None` when the
/// header holds more bits than u64 counts. Counting in u64 keeps the result exact on every pointer
/// width, where `byte_count * 8` in usize wraps above `usize::MAX / 8` bytes.
/// The setup scan's answer for a header of `byte_count` bytes at bit `position`: the bits left, or
/// `ResourceLimitExceeded` when the header holds more bits than u64 counts. The scan calls it with
/// its slice's real length; a test can pass any length without allocating one.
fn get_vorbis_setup_remaining_bit_budget(
    byte_count: usize,
    position: u64,
) -> Result<u64, DecodeFailure> {
    return match get_vorbis_setup_remaining_bits(byte_count, position) {
        Some(remaining) => Ok(remaining),
        None => Err(setup_header_too_long()),
    };
}

fn get_vorbis_setup_remaining_bits(byte_count: usize, position: u64) -> Option<u64> {
    return u64::try_from(byte_count).ok().and_then(|byte_count| {
        return get_vorbis_setup_remaining_bits_in_u64(byte_count, position);
    });
}

/// `get_vorbis_setup_remaining_bits` for a byte count already widened to u64.
fn get_vorbis_setup_remaining_bits_in_u64(byte_count: u64, position: u64) -> Option<u64> {
    return byte_count
        .checked_mul(8)
        .map(|bit_count| return bit_count.saturating_sub(position));
}

fn get_vorbis_value_bit_count(value: u64) -> u32 {
    return u64::BITS - value.leading_zeros();
}

/// Whether `bytes` is a run of Ogg pages whose last page is cut short. A stream that diverges from
/// the page structure before its end is malformed, not truncated.
fn is_ogg_input_cut_inside_a_page(bytes: &[u8]) -> bool {
    let mut offset: usize = 0;
    while offset < bytes.len() {
        let page = &bytes[offset..];
        if page.len() < OGG_CAPTURE_PATTERN.len() {
            return OGG_CAPTURE_PATTERN.starts_with(page);
        }
        if !page.starts_with(OGG_CAPTURE_PATTERN) {
            return false;
        }
        if page.len() < OGG_PAGE_HEADER_LENGTH {
            return true;
        }
        let segments = usize::from(page[OGG_PAGE_HEADER_LENGTH - 1]);
        let Some(lacing) = page.get(OGG_PAGE_HEADER_LENGTH..OGG_PAGE_HEADER_LENGTH + segments)
        else {
            return true;
        };
        let length = OGG_PAGE_HEADER_LENGTH
            + segments
            + lacing
                .iter()
                .map(|value| return usize::from(*value))
                .sum::<usize>();
        if page.len() < length {
            return true;
        }
        offset += length;
    }
    return false;
}

fn malformed(message: &'static str) -> DecodeFailure {
    return create_decode_failure(
        AudioCodecsHostDecodeExplanationReason::MalformedInput,
        message,
    );
}

fn map_audio_error(error: AudioReadError) -> DecodeFailure {
    return match error {
        AudioReadError::BufferNotAddressable => create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
            "a Vorbis audio packet needs more memory than is addressable",
        ),
        AudioReadError::EndOfPacket
        | AudioReadError::AudioBadFormat
        | AudioReadError::AudioIsHeader => malformed("a Vorbis audio packet is malformed"),
    };
}

fn map_ident_error(error: HeaderReadError) -> DecodeFailure {
    return match error {
        HeaderReadError::NotVorbisHeader | HeaderReadError::UnsupportedVorbisVersion => {
            create_decode_failure(
                AudioCodecsHostDecodeExplanationReason::UnsupportedEncoding,
                "the Ogg stream does not carry Vorbis I audio",
            )
        }
        _ => malformed("the Vorbis identification header is malformed"),
    };
}

/// The container reader reports a cut page variously as a read error or a missing capture
/// pattern, so truncation is decided by walking the page headers instead.
fn map_ogg_error(bytes: &[u8], _error: OggReadError) -> DecodeFailure {
    if is_ogg_input_cut_inside_a_page(bytes) {
        return create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::TruncatedInput,
            "Ogg input ends inside a page",
        );
    }
    return malformed("input is not a well-formed Ogg stream");
}

fn map_setup_error(error: HeaderReadError) -> DecodeFailure {
    return match error {
        HeaderReadError::BufferNotAddressable => create_decode_failure(
            AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
            "the Vorbis setup header needs more memory than is addressable",
        ),
        _ => malformed("the Vorbis setup header is malformed"),
    };
}

fn missing_header() -> DecodeFailure {
    return create_decode_failure(
        AudioCodecsHostDecodeExplanationReason::TruncatedInput,
        "Ogg input ends before the three Vorbis headers",
    );
}

/// Hands the setup header to the backing parser. Unit tests count these entries to prove that a
/// codebook-table rejection never reaches it.
fn open_vorbis_setup(packet: &[u8], ident: &IdentHeader) -> Result<SetupHeader, HeaderReadError> {
    #[cfg(test)]
    VORBIS_SETUP_PARSES.with(|count| count.set(count.get() + 1));
    return read_header_setup(
        packet,
        ident.audio_channels,
        (ident.blocksize_0, ident.blocksize_1),
    );
}

fn read_setup_bits(bits: &mut SetupBits<'_>, count: u32) -> Result<u64, DecodeFailure> {
    let mut value: u64 = 0;
    for offset in 0..count {
        let byte = usize::try_from(bits.position / 8)
            .ok()
            .and_then(|index| return bits.bytes.get(index))
            .ok_or_else(|| return malformed("the Vorbis setup header ends inside a codebook"))?;
        let bit = (byte >> (bits.position % 8)) & 1;
        value |= u64::from(bit) << offset;
        bits.position += 1;
    }
    return Ok(value);
}

fn read_stream_packet(
    reader: &mut PacketReader<Cursor<&[u8]>>,
    serial: u32,
    bytes: &[u8],
) -> Result<Option<Packet>, DecodeFailure> {
    loop {
        let Some(packet) = reader
            .read_packet()
            .map_err(|error| return map_ogg_error(bytes, error))?
        else {
            return Ok(None);
        };
        if packet.stream_serial() == serial {
            return Ok(Some(packet));
        }
    }
}

/// Walks the codebook section of a Vorbis setup header and bounds the decoder's codebook tables
/// before the setup header is parsed: a header may declare up to 2^24 entries of up to 65,535
/// dimensions, whose lookup tables would otherwise be allocated without a bound.
fn scan_vorbis_codebook_tables(packet: &[u8]) -> Result<(), DecodeFailure> {
    if !packet.starts_with(VORBIS_SETUP_HEADER_PREFIX) {
        return Err(malformed("third Vorbis packet is not a setup header"));
    }
    let mut bits = SetupBits {
        bytes: &packet[VORBIS_SETUP_HEADER_PREFIX.len()..],
        position: 0,
    };
    let codebook_count = read_setup_bits(&mut bits, 8)? + 1;
    let mut table_values: u64 = 0;
    for _ in 0..codebook_count {
        if read_setup_bits(&mut bits, 24)? != VORBIS_CODEBOOK_SYNC {
            return Err(malformed("a Vorbis codebook lacks its sync pattern"));
        }
        let dimensions = read_setup_bits(&mut bits, 16)?;
        let entries = read_setup_bits(&mut bits, 24)?;
        if read_setup_bits(&mut bits, 1)? == 1 {
            read_setup_bits(&mut bits, 5)?;
            let mut entry: u64 = 0;
            while entry < entries {
                entry += read_setup_bits(&mut bits, get_vorbis_value_bit_count(entries - entry))?;
            }
            if entry > entries {
                return Err(malformed(
                    "a Vorbis codebook's ordered lengths overrun its entries",
                ));
            }
        } else {
            let sparse = read_setup_bits(&mut bits, 1)? == 1;
            for _ in 0..entries {
                if !sparse || read_setup_bits(&mut bits, 1)? == 1 {
                    read_setup_bits(&mut bits, 5)?;
                }
            }
        }
        table_values += entries;
        let lookup_type = read_setup_bits(&mut bits, 4)?;
        if lookup_type == 0 {
            if table_values > MAX_VORBIS_CODEBOOK_TABLE_VALUES {
                return Err(codebook_tables_too_large());
            }
            continue;
        }
        if lookup_type > 2 || dimensions == 0 {
            return Err(malformed("a Vorbis codebook has an invalid lookup table"));
        }
        read_setup_bits(&mut bits, 32)?;
        read_setup_bits(&mut bits, 32)?;
        let value_bits = read_setup_bits(&mut bits, 4)? + 1;
        read_setup_bits(&mut bits, 1)?;
        table_values += entries * dimensions;
        if table_values > MAX_VORBIS_CODEBOOK_TABLE_VALUES {
            return Err(codebook_tables_too_large());
        }
        let value_count = if lookup_type == 1 {
            get_vorbis_lookup1_value_count(entries, dimensions as u32)
        } else {
            entries * dimensions
        };
        let remaining = get_vorbis_setup_remaining_bit_budget(bits.bytes.len(), bits.position)?;
        let skipped = value_count * value_bits;
        if skipped > remaining {
            return Err(malformed("the Vorbis setup header ends inside a codebook"));
        }
        bits.position += skipped;
    }
    return Ok(());
}

fn setup_header_too_long() -> DecodeFailure {
    return create_decode_failure(
        AudioCodecsHostDecodeExplanationReason::ResourceLimitExceeded,
        "the Vorbis setup header holds more bits than its bit cursor counts",
    );
}

// flight-lint: allow(hidden-state) test-only probe counting backing-parser entries; compiled out of the library
#[cfg(test)]
thread_local! {
    /// How many times this thread has handed a setup header to the backing parser.
    static VORBIS_SETUP_PARSES: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}
