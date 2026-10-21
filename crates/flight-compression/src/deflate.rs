use crate::deflate_format::{compute_adler32, DISTANCE_BASE, DISTANCE_EXTRA, LENGTH_BASE, LENGTH_EXTRA};
use crate::types::{CompressionFraming, HostDecompressDeflateCapability};

// Dependency-free, synchronous RFC 1951 (DEFLATE) and RFC 1950 (zlib) decoding. Kept in its own module
// so this stays tree-shakable: a bundle that never references `sdk_host_decompress_deflate` pays
// nothing for this Huffman decoder.

// The order in which the 19 code-length-code lengths are written in a dynamic-Huffman block header.
const CODE_LENGTH_ORDER: [usize; 19] = [
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

// A canonical Huffman decode table built from per-symbol code lengths.
struct HuffmanTree {
    counts: Vec<i32>,
    symbols: Vec<i32>,
}

// An LSB-first bit reader over the DEFLATE stream, plus the growable output buffer.
struct InflateState {
    input: Vec<u8>,
    bit_buffer: u32,
    bit_count: u32,
    output: Vec<u8>,
    output_length: usize,
    output_limit: usize,
    position: usize,
}

fn create_fixed_trees() -> (HuffmanTree, HuffmanTree) {
    let literal_tree = build_fixed_literal_tree();
    let dist_lengths = vec![5i32; 30];
    let distance_tree = build_huffman_tree(&dist_lengths, 30);
    return (literal_tree, distance_tree);
}

/// The deflate slot Flight itself can fill, ready to drop into a Host's `decompress` group.
pub fn create_sdk_host_decompress_deflate() -> HostDecompressDeflateCapability {
    return HostDecompressDeflateCapability {
        decompress: decompress_deflate,
    };
}

fn build_fixed_literal_tree() -> HuffmanTree {
    let mut lengths = vec![0i32; 288];
    for i in 0..144 {
        lengths[i] = 8;
    }
    for i in 144..256 {
        lengths[i] = 9;
    }
    for i in 256..280 {
        lengths[i] = 7;
    }
    for i in 280..288 {
        lengths[i] = 8;
    }
    return build_huffman_tree(&lengths, 288);
}

fn build_huffman_tree(lengths: &[i32], count: usize) -> HuffmanTree {
    let mut counts = vec![0i32; 16];
    for i in 0..count {
        counts[lengths[i] as usize] += 1;
    }
    counts[0] = 0;

    let mut offsets = vec![0i32; 16];
    for len in 1..16 {
        offsets[len] = offsets[len - 1] + counts[len - 1];
    }

    let mut symbols = vec![0i32; count];
    for i in 0..count {
        if lengths[i] != 0 {
            symbols[offsets[lengths[i] as usize] as usize] = i as i32;
            offsets[lengths[i] as usize] += 1;
        }
    }
    return HuffmanTree { counts, symbols };
}

fn decode_symbol(state: &mut InflateState, tree: &HuffmanTree) -> Result<i32, String> {
    let mut code: i32 = 0;
    let mut first: i32 = 0;
    let mut index: i32 = 0;
    for len in 1..16 {
        code |= inflate_state_read_bit(state)?;
        let count = tree.counts[len];
        if code - first < count {
            return Ok(tree.symbols[(index + (code - first)) as usize]);
        }
        index += count;
        first += count;
        first <<= 1;
        code <<= 1;
    }
    return Err("deflate: invalid Huffman code".to_string());
}

/// Decompress a DEFLATE or zlib stream. Returns None on any error, invalid input, or checksum mismatch.
pub fn decompress_deflate(
    compressed: &[u8],
    uncompressed_length: usize,
    framing: CompressionFraming,
) -> Option<Vec<u8>> {
    let input = compressed;
    let mut start: usize = 0;
    let mut end: usize = input.len();

    match framing {
        CompressionFraming::Rfc1950 => {
            if input.len() < ZLIB_HEADER_BYTES + ZLIB_TRAILER_BYTES {
                return None;
            }
            let cmf = input[0];
            let flg = input[1];
            if (cmf & 0x0f) != 8
                || cmf >> 4 > 7
                || ((cmf as u16) << 8 | flg as u16) % 31 != 0
                || (flg & 0x20) != 0
            {
                return None;
            }
            start = 2;
            end -= ZLIB_TRAILER_BYTES;
        }
        CompressionFraming::Raw => {}
    }

    match raw_inflate(&input[..end], start, uncompressed_length) {
        Ok(output) => {
            if framing == CompressionFraming::Rfc1950
                && read_zlib_adler32(input, end) != compute_adler32(&output)
            {
                return None;
            }
            return Some(output);
        }
        Err(_) => {
            return None;
        }
    }
}

fn inflate_dynamic_block(state: &mut InflateState) -> Result<(), String> {
    let literal_count = inflate_state_read_bits(state, 5, 257)?;
    let distance_count = inflate_state_read_bits(state, 5, 1)?;
    let code_length_count = inflate_state_read_bits(state, 4, 4)?;
    if literal_count > 286 {
        return Err("deflate: too many literal/length symbols".to_string());
    }

    let mut code_length_lengths = vec![0i32; 19];
    for i in 0..code_length_count as usize {
        code_length_lengths[CODE_LENGTH_ORDER[i]] = inflate_state_read_bits(state, 3, 0)?;
    }
    let code_length_tree = build_huffman_tree(&code_length_lengths, 19);

    // Decode the literal+distance code lengths as one run, honoring the repeat codes 16 (copy
    // previous 3-6x), 17 (zero 3-10x), and 18 (zero 11-138x).
    let total = (literal_count + distance_count) as usize;
    let mut lengths = vec![0i32; total];
    let mut i: usize = 0;
    while i < lengths.len() {
        let symbol = decode_symbol(state, &code_length_tree)?;
        if symbol < 16 {
            lengths[i] = symbol;
            i += 1;
        } else if symbol == 16 {
            if i == 0 {
                return Err("deflate: repeat with no previous length".to_string());
            }
            let repeat = inflate_state_read_bits(state, 2, 3)? as usize;
            if i + repeat > lengths.len() {
                return Err(
                    "deflate: code-length repeat exceeds the declared table".to_string(),
                );
            }
            let previous = lengths[i - 1];
            for _ in 0..repeat {
                lengths[i] = previous;
                i += 1;
            }
        } else if symbol == 17 {
            let repeat = inflate_state_read_bits(state, 3, 3)? as usize;
            if i + repeat > lengths.len() {
                return Err(
                    "deflate: code-length repeat exceeds the declared table".to_string(),
                );
            }
            for _ in 0..repeat {
                lengths[i] = 0;
                i += 1;
            }
        } else {
            // The code-length alphabet has exactly symbols 0-18, so after the cases above this is 18.
            let repeat = inflate_state_read_bits(state, 7, 11)? as usize;
            if i + repeat > lengths.len() {
                return Err(
                    "deflate: code-length repeat exceeds the declared table".to_string(),
                );
            }
            for _ in 0..repeat {
                lengths[i] = 0;
                i += 1;
            }
        }
    }

    let literal_tree = build_huffman_tree(&lengths[..literal_count as usize], literal_count as usize);
    let distance_tree = build_huffman_tree(
        &lengths[literal_count as usize..],
        distance_count as usize,
    );
    inflate_huffman_block(state, &literal_tree, &distance_tree)?;
    return Ok(());
}

fn inflate_huffman_block(
    state: &mut InflateState,
    literal_tree: &HuffmanTree,
    distance_tree: &HuffmanTree,
) -> Result<(), String> {
    loop {
        let symbol = decode_symbol(state, literal_tree)?;
        if symbol == 256 {
            return Ok(());
        } // end of block
        if symbol < 256 {
            inflate_state_write_byte(state, symbol as u8)?;
            continue;
        }
        let length_index = symbol - 257;
        if length_index >= LENGTH_BASE.len() as i32 {
            return Err("deflate: invalid length symbol".to_string());
        }
        let length = inflate_state_read_bits(
            state,
            LENGTH_EXTRA[length_index as usize],
            LENGTH_BASE[length_index as usize],
        )?;
        let distance_symbol = decode_symbol(state, distance_tree)?;
        if distance_symbol >= DISTANCE_BASE.len() as i32 {
            return Err("deflate: invalid distance symbol".to_string());
        }
        let distance = inflate_state_read_bits(
            state,
            DISTANCE_EXTRA[distance_symbol as usize],
            DISTANCE_BASE[distance_symbol as usize],
        )?;
        let mut source = state.output_length as i32 - distance;
        if source < 0 {
            return Err("deflate: back-reference before start of output".to_string());
        }
        for _ in 0..length {
            let byte = state.output[source as usize];
            inflate_state_write_byte(state, byte)?;
            source += 1;
        }
    }
}

fn inflate_state_read_bit(state: &mut InflateState) -> Result<i32, String> {
    if state.bit_count == 0 {
        if state.position >= state.input.len() {
            return Err("deflate: read past end of stream".to_string());
        }
        state.bit_buffer = state.input[state.position] as u32;
        state.position += 1;
        state.bit_count = 8;
    }
    let bit = (state.bit_buffer & 1) as i32;
    state.bit_buffer >>= 1;
    state.bit_count -= 1;
    return Ok(bit);
}

fn inflate_state_read_bits(state: &mut InflateState, count: i32, base: i32) -> Result<i32, String> {
    let mut value = 0i32;
    for i in 0..count {
        value |= inflate_state_read_bit(state)? << i;
    }
    return Ok(value + base);
}

fn inflate_state_write_byte(state: &mut InflateState, byte: u8) -> Result<(), String> {
    if state.output_length >= state.output_limit {
        return Err("deflate: output exceeds the inflate limit".to_string());
    }
    if state.output_length >= state.output.len() {
        let new_len = (state.output.len() * 2).min(state.output_limit);
        state.output.resize(new_len, 0);
    }
    state.output[state.output_length] = byte;
    state.output_length += 1;
    return Ok(());
}

fn inflate_stored_block(state: &mut InflateState) -> Result<(), String> {
    state.bit_buffer = 0;
    state.bit_count = 0;
    if state.position + 4 > state.input.len() {
        return Err("deflate: truncated stored block header".to_string());
    }
    let len =
        state.input[state.position] as u32 | ((state.input[state.position + 1] as u32) << 8);
    let nlen =
        state.input[state.position + 2] as u32 | ((state.input[state.position + 3] as u32) << 8);
    state.position += 4;
    if (len ^ 0xffff) != nlen {
        return Err("deflate: stored block length mismatch".to_string());
    }
    if state.position + len as usize > state.input.len() {
        return Err("deflate: truncated stored block data".to_string());
    }
    for _ in 0..len {
        inflate_state_write_byte(state, state.input[state.position])?;
        state.position += 1;
    }
    return Ok(());
}

fn raw_inflate(input: &[u8], start: usize, uncompressed_length: usize) -> Result<Vec<u8>, String> {
    let declared_limit = if uncompressed_length > 0 {
        uncompressed_length
    } else {
        MAX_INFLATE_BYTES
    };
    let limit = declared_limit.min(MAX_INFLATE_BYTES);
    let mut state = InflateState {
        input: input.to_vec(),
        bit_buffer: 0,
        bit_count: 0,
        output: vec![0u8; INITIAL_INFLATE_BYTES.min(limit)],
        output_length: 0,
        output_limit: limit,
        position: start,
    };

    let (fixed_literal_tree, fixed_distance_tree) = create_fixed_trees();

    let mut final_flag;
    loop {
        final_flag = inflate_state_read_bit(&mut state)?;
        let block_type = inflate_state_read_bits(&mut state, 2, 0)?;
        if block_type == 0 {
            inflate_stored_block(&mut state)?;
        } else if block_type == 1 {
            inflate_huffman_block(&mut state, &fixed_literal_tree, &fixed_distance_tree)?;
        } else if block_type == 2 {
            inflate_dynamic_block(&mut state)?;
        } else {
            return Err("deflate: invalid block type".to_string());
        }
        if final_flag != 0 {
            break;
        }
    }

    return if state.output_length == state.output.len() {
        Ok(state.output)
    } else {
        Ok(state.output[..state.output_length].to_vec())
    };
}

fn read_zlib_adler32(input: &[u8], offset: usize) -> u32 {
    return ((input[offset] as u32) << 24)
        | ((input[offset + 1] as u32) << 16)
        | ((input[offset + 2] as u32) << 8)
        | (input[offset + 3] as u32);
}

const MAX_INFLATE_BYTES: usize = 256 * 1024 * 1024;
const INITIAL_INFLATE_BYTES: usize = 1024;
const ZLIB_HEADER_BYTES: usize = 2;
const ZLIB_TRAILER_BYTES: usize = 4;
