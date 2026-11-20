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
    use crate::audio_codecs_host::create_audio_codecs_host_options;
    use crate::generated_media::{
        VorbisChannelContent, create_vorbis_stream_shape, encode_ogg_vorbis,
        encode_ogg_vorbis_with_single_codebook, encode_vorbis_setup_with_single_codebook,
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
}

/// A little-endian bit cursor over a Vorbis setup header, as the Vorbis bitstream packs fields
/// from the least significant bit of each byte.
struct SetupBits<'a> {
    bytes: &'a [u8],
    position: usize,
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
        let byte = bits
            .bytes
            .get(bits.position / 8)
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
        let remaining = (bits.bytes.len() * 8).saturating_sub(bits.position) as u64;
        let skipped = value_count * value_bits;
        if skipped > remaining {
            return Err(malformed("the Vorbis setup header ends inside a codebook"));
        }
        bits.position += skipped as usize;
    }
    return Ok(());
}

// flight-lint: allow(hidden-state) test-only probe counting backing-parser entries; compiled out of the library
#[cfg(test)]
thread_local! {
    /// How many times this thread has handed a setup header to the backing parser.
    static VORBIS_SETUP_PARSES: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}
