use crate::deflate_format::{compute_adler32, DISTANCE_BASE, DISTANCE_EXTRA, LENGTH_BASE, LENGTH_EXTRA};
use crate::types::{CompressionFraming, HostCompressDeflateCapability};

// Dependency-free, synchronous RFC 1951 (DEFLATE) and RFC 1950 (zlib) encoding, in its own module so a
// bundle that only reads compressed bytes never carries an encoder and vice versa. Written from the
// format's own rules -- the code tables it shares with the decoder are in deflate_format.
//
// One fixed-Huffman block over the whole input, with greedy LZ77 matching through a hash chain. Fixed
// rather than dynamic Huffman because a dynamic block must also encode its own code lengths, which buys
// a further few percent for a large amount of code; fixed already collapses the repetition that makes
// containers worth compressing. When the encoded block would be larger than the bytes themselves -- which
// is what incompressible input does -- stored blocks are emitted instead, so compressing never meaningfully
// grows a payload. Output is a pure function of the input: no timestamps, no heuristics that vary.

struct DeflateBitWriter {
    bit_count: u32,
    bit_buffer: u32,
    bytes: Vec<u8>,
    length: usize,
}

fn create_deflate_bit_writer() -> DeflateBitWriter {
    return DeflateBitWriter {
        bit_count: 0,
        bit_buffer: 0,
        bytes: vec![0u8; INITIAL_OUTPUT_BYTES],
        length: 0,
    };
}

fn dw_write_bit(writer: &mut DeflateBitWriter, bit: u32) {
    writer.bit_buffer |= bit << writer.bit_count;
    writer.bit_count += 1;
    if writer.bit_count == 8 {
        dw_push(writer, writer.bit_buffer as u8);
        writer.bit_buffer = 0;
        writer.bit_count = 0;
    }
}

fn dw_write_bits(writer: &mut DeflateBitWriter, value: u32, count: u32) {
    for i in 0..count {
        dw_write_bit(writer, (value >> i) & 1);
    }
}

fn dw_write_code(writer: &mut DeflateBitWriter, code: u32, count: u32) {
    for i in (0..count).rev() {
        dw_write_bit(writer, (code >> i) & 1);
    }
}

fn dw_align_to_byte(writer: &mut DeflateBitWriter) {
    if writer.bit_count != 0 {
        dw_push(writer, writer.bit_buffer as u8);
        writer.bit_buffer = 0;
        writer.bit_count = 0;
    }
}

fn dw_write_byte(writer: &mut DeflateBitWriter, value: u8) {
    dw_push(writer, value);
}

fn dw_finish(writer: &mut DeflateBitWriter) -> Vec<u8> {
    dw_align_to_byte(writer);
    return writer.bytes[..writer.length].to_vec();
}

fn dw_push(writer: &mut DeflateBitWriter, value: u8) {
    if writer.length == writer.bytes.len() {
        let mut grown = vec![0u8; writer.bytes.len() * 2];
        grown[..writer.bytes.len()].copy_from_slice(&writer.bytes);
        writer.bytes = grown;
    }
    writer.bytes[writer.length] = value;
    writer.length += 1;
}

/// The deflate compress slot Flight itself can fill, ready to drop into a Host's `compress` group.
/// Dispatches on framing to the matching encoder.
pub fn create_sdk_host_compress_deflate() -> HostCompressDeflateCapability {
    return HostCompressDeflateCapability {
        compress: sdk_host_compress_deflate_compress,
    };
}

fn sdk_host_compress_deflate_compress(bytes: &[u8], framing: CompressionFraming) -> Vec<u8> {
    return if framing == CompressionFraming::Rfc1950 {
        compress_deflate_zlib(bytes)
    } else {
        compress_deflate(bytes)
    };
}

/// Raw RFC 1951: the DEFLATE stream alone, with no wrapper. This is the framing `decompress_deflate`
/// reads as CompressionFraming::Raw.
pub fn compress_deflate(bytes: &[u8]) -> Vec<u8> {
    let huffman = encode_fixed_huffman_block(bytes);
    return if huffman.len() <= stored_length(bytes.len()) {
        huffman
    } else {
        encode_stored_blocks(bytes)
    };
}

/// RFC 1950: a two-byte header, the same DEFLATE stream, and an Adler-32 of the UNCOMPRESSED bytes,
/// in big-endian order. This is the framing `decompress_deflate` reads as CompressionFraming::Rfc1950.
pub fn compress_deflate_zlib(bytes: &[u8]) -> Vec<u8> {
    let deflated = compress_deflate(bytes);
    let mut out = vec![0u8; ZLIB_HEADER_BYTES + deflated.len() + ZLIB_TRAILER_BYTES];
    out[0] = ZLIB_CMF;
    out[1] = ZLIB_FLG;
    out[ZLIB_HEADER_BYTES..ZLIB_HEADER_BYTES + deflated.len()].copy_from_slice(&deflated);
    let checksum = compute_adler32(bytes);
    let trailer = ZLIB_HEADER_BYTES + deflated.len();
    out[trailer] = ((checksum >> 24) & 0xff) as u8;
    out[trailer + 1] = ((checksum >> 16) & 0xff) as u8;
    out[trailer + 2] = ((checksum >> 8) & 0xff) as u8;
    out[trailer + 3] = (checksum & 0xff) as u8;
    return out;
}

fn encode_fixed_huffman_block(input: &[u8]) -> Vec<u8> {
    let mut writer = create_deflate_bit_writer();
    dw_write_bits(&mut writer, 1, 1);
    dw_write_bits(&mut writer, FIXED_HUFFMAN_BLOCK, 2);

    // Hash chain over three-byte prefixes: `head` is the most recent position for a prefix and
    // `previous` links each position to the one before it, so a match search walks candidates
    // newest-first and can be cut off by depth rather than scanning the window.
    let mut head: Vec<i32> = vec![-1i32; HASH_SIZE];
    let mut previous: Vec<i32> = vec![-1i32; input.len()];

    let mut position: usize = 0;
    while position < input.len() {
        let mut match_length: usize = 0;
        let mut match_distance: usize = 0;
        if position + MIN_MATCH <= input.len() {
            let key = hash_at(input, position);
            let mut candidate = head[key];
            let mut attempts = 0;
            while candidate >= 0 && attempts < MAX_CHAIN {
                let distance = position as i32 - candidate;
                if distance > MAX_DISTANCE as i32 {
                    break;
                }
                let length = match_run_length(input, candidate as usize, position);
                if length > match_length {
                    match_length = length;
                    match_distance = distance as usize;
                    if length == MAX_MATCH {
                        break;
                    }
                }
                candidate = previous[candidate as usize];
                attempts += 1;
            }
            previous[position] = head[key];
            head[key] = position as i32;
        }

        if match_length >= MIN_MATCH {
            write_length_symbol(&mut writer, match_length as i32);
            write_distance_symbol(&mut writer, match_distance as i32);
            // Positions inside the match still enter the chain, so a later repeat that begins
            // mid-match is findable.
            for i in 1..match_length {
                let inner = position + i;
                if inner + MIN_MATCH <= input.len() {
                    let key = hash_at(input, inner);
                    previous[inner] = head[key];
                    head[key] = inner as i32;
                }
            }
            position += match_length;
            continue;
        }

        write_literal_symbol(&mut writer, input[position] as i32);
        position += 1;
    }

    write_literal_symbol(&mut writer, END_OF_BLOCK);
    return dw_finish(&mut writer);
}

// Type-00 blocks: a byte-aligned length and its one's complement, then the bytes verbatim. Each block
// carries at most 65535 bytes, so a long input needs several.
fn encode_stored_blocks(input: &[u8]) -> Vec<u8> {
    let mut writer = create_deflate_bit_writer();
    let mut offset: usize = 0;
    loop {
        let size = STORED_BLOCK_MAX.min(input.len() - offset);
        let final_flag: u32 = if offset + size >= input.len() { 1 } else { 0 };
        dw_write_bits(&mut writer, final_flag, 1);
        dw_write_bits(&mut writer, STORED_BLOCK, 2);
        dw_align_to_byte(&mut writer);
        dw_write_byte(&mut writer, (size & 0xff) as u8);
        dw_write_byte(&mut writer, ((size >> 8) & 0xff) as u8);
        dw_write_byte(&mut writer, (!size & 0xff) as u8);
        dw_write_byte(&mut writer, ((!size >> 8) & 0xff) as u8);
        for i in 0..size {
            dw_write_byte(&mut writer, input[offset + i]);
        }
        offset += size;
        if offset >= input.len() {
            break;
        }
    }
    return dw_finish(&mut writer);
}

fn stored_length(input_length: usize) -> usize {
    let blocks = 1usize.max((input_length + STORED_BLOCK_MAX - 1) / STORED_BLOCK_MAX);
    return blocks * STORED_BLOCK_OVERHEAD + input_length;
}

fn hash_at(input: &[u8], position: usize) -> usize {
    return (((input[position] as u32) << 10)
        ^ ((input[position + 1] as u32) << 5)
        ^ (input[position + 2] as u32)) as usize
        & HASH_MASK;
}

fn match_run_length(input: &[u8], candidate: usize, position: usize) -> usize {
    let limit = (input.len() - position).min(MAX_MATCH);
    let mut length: usize = 0;
    while length < limit && input[candidate + length] == input[position + length] {
        length += 1;
    }
    return length;
}

// The fixed literal/length alphabet changes code width three times across its range; the boundaries
// are the format's, and getting one wrong yields a stream that decodes correctly only below it.
fn write_literal_symbol(writer: &mut DeflateBitWriter, symbol: i32) {
    if symbol <= 143 {
        dw_write_code(writer, (0x30 + symbol) as u32, 8);
    } else if symbol <= 255 {
        dw_write_code(writer, (0x190 + symbol - 144) as u32, 9);
    } else if symbol <= 279 {
        dw_write_code(writer, (symbol - 256) as u32, 7);
    } else {
        dw_write_code(writer, (0xc0 + symbol - 280) as u32, 8);
    }
}

fn write_length_symbol(writer: &mut DeflateBitWriter, length: i32) {
    let mut index = LENGTH_BASE.len() as i32 - 1;
    while index > 0 && LENGTH_BASE[index as usize] > length {
        index -= 1;
    }
    write_literal_symbol(writer, FIRST_LENGTH_SYMBOL + index);
    dw_write_bits(
        writer,
        (length - LENGTH_BASE[index as usize]) as u32,
        LENGTH_EXTRA[index as usize] as u32,
    );
}

fn write_distance_symbol(writer: &mut DeflateBitWriter, distance: i32) {
    let mut index = DISTANCE_BASE.len() as i32 - 1;
    while index > 0 && DISTANCE_BASE[index as usize] > distance {
        index -= 1;
    }
    dw_write_code(writer, index as u32, 5);
    dw_write_bits(
        writer,
        (distance - DISTANCE_BASE[index as usize]) as u32,
        DISTANCE_EXTRA[index as usize] as u32,
    );
}

const END_OF_BLOCK: i32 = 256;
const FIRST_LENGTH_SYMBOL: i32 = 257;
const FIXED_HUFFMAN_BLOCK: u32 = 1;
const HASH_BITS: usize = 15;
const HASH_MASK: usize = (1 << HASH_BITS) - 1;
const HASH_SIZE: usize = 1 << HASH_BITS;
const INITIAL_OUTPUT_BYTES: usize = 1024;
const MAX_CHAIN: i32 = 32;
const MAX_DISTANCE: usize = 32768;
const MAX_MATCH: usize = 258;
const MIN_MATCH: usize = 3;
const STORED_BLOCK: u32 = 0;
const STORED_BLOCK_MAX: usize = 65535;
const STORED_BLOCK_OVERHEAD: usize = 5;
const ZLIB_CMF: u8 = 0x78;
const ZLIB_FLG: u8 = 0x01;
const ZLIB_HEADER_BYTES: usize = 2;
const ZLIB_TRAILER_BYTES: usize = 4;
