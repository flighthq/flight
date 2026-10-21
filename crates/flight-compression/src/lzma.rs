use std::sync::{Arc, LazyLock};

use flight_entity::Uint8Array;

use crate::types::{CompressionFraming, HostDecompressLzmaCapability};

// Range coder decoder state, separate from probability tables to avoid borrow conflicts.
struct RcDec {
    input: Vec<u8>,
    range: u32,
    code: u32,
    pos: usize,
}

/// The LZMA decompress slot Flight itself can fill, ready to drop into a Host's `decompress` group.
/// TS `sdkHostDecompressLzma`.
pub static SDK_HOST_DECOMPRESS_LZMA: LazyLock<HostDecompressLzmaCapability> =
    LazyLock::new(|| HostDecompressLzmaCapability {
        decompress: Arc::new(decompress_lzma),
    });

/// Decompress an LZMA-alone stream. Only Raw framing is supported. Returns None on any error.
pub fn decompress_lzma(
    compressed: &Uint8Array,
    uncompressed_length: usize,
    framing: CompressionFraming,
) -> Option<Box<Uint8Array>> {
    if framing != CompressionFraming::Raw {
        return None;
    }
    if compressed.len() < LZMA_HEADER_SIZE {
        return None;
    }
    match lzma_decode(compressed, uncompressed_length) {
        Ok(result) => return Some(result.into_boxed_slice()),
        Err(_) => return None,
    }
}

fn ensure_capacity(output: &mut Vec<u8>, needed: usize, output_limit: usize) -> Result<(), String> {
    if needed > output_limit {
        return Err("lzma: output exceeds the decode limit".to_string());
    }
    if needed <= output.len() {
        return Ok(());
    }
    let mut new_cap = output.len();
    while new_cap < needed {
        new_cap = if new_cap < 1 << 30 {
            new_cap * 2
        } else {
            new_cap + (1 << 30)
        };
    }
    if new_cap > output_limit {
        new_cap = output_limit;
    }
    output.resize(new_cap, 0);
    return Ok(());
}

fn init_probs(count: usize) -> Vec<u16> {
    return vec![PROB_INIT; count];
}

fn lzma_decode(input: &[u8], uncompressed_length: usize) -> Result<Vec<u8>, String> {
    let prop_byte = input[0];
    if prop_byte >= 225 {
        return Err("lzma: invalid properties byte".to_string());
    }

    let lc = (prop_byte % 9) as u32;
    let remainder = ((prop_byte - (prop_byte % 9)) / 9) as u32;
    let lp = remainder % 5;
    let pb = (remainder - (remainder % 5)) / 5;

    let mut dict_size = (input[1] as u32)
        | ((input[2] as u32) << 8)
        | ((input[3] as u32) << 16)
        | ((input[4] as u32) << 24);
    if dict_size < LZMA_MIN_DICT_SIZE {
        dict_size = LZMA_MIN_DICT_SIZE;
    }

    let header_size_lo = (input[5] as u32)
        | ((input[6] as u32) << 8)
        | ((input[7] as u32) << 16)
        | ((input[8] as u32) << 24);
    let header_size_hi = (input[9] as u32)
        | ((input[10] as u32) << 8)
        | ((input[11] as u32) << 16)
        | ((input[12] as u32) << 24);
    let header_size_known = !(header_size_lo == 0xffffffff && header_size_hi == 0xffffffff);
    if header_size_known && header_size_hi > 0 {
        return Err("lzma: size exceeds addressable range".to_string());
    }

    if uncompressed_length > 0
        && header_size_known
        && uncompressed_length != header_size_lo as usize
    {
        return Err("lzma: caller size disagrees with header".to_string());
    }

    let expected_size: usize;
    let size_known: bool;
    if header_size_known {
        expected_size = header_size_lo as usize;
        size_known = true;
    } else if uncompressed_length > 0 {
        expected_size = uncompressed_length;
        size_known = true;
    } else {
        expected_size = 0;
        size_known = false;
    }
    if size_known && expected_size > MAX_LZMA_BYTES {
        return Err("lzma: size exceeds the decode limit".to_string());
    }

    let rc_start = LZMA_HEADER_SIZE;
    if rc_start + 5 > input.len() {
        return Err("lzma: truncated range coder".to_string());
    }
    if input[rc_start] != 0x00 {
        return Err("lzma: invalid range coder start byte".to_string());
    }

    let mut rc = RcDec {
        input: input.to_vec(),
        range: 0xffffffff,
        code: ((input[rc_start + 1] as u32) << 24)
            | ((input[rc_start + 2] as u32) << 16)
            | ((input[rc_start + 3] as u32) << 8)
            | (input[rc_start + 4] as u32),
        pos: rc_start + 5,
    };

    let num_pos_states = 1usize << pb;
    let pos_mask = num_pos_states - 1;
    let mut is_match = init_probs(NUM_STATES * num_pos_states);
    let mut is_rep = init_probs(NUM_STATES);
    let mut is_rep_g0 = init_probs(NUM_STATES);
    let mut is_rep_g1 = init_probs(NUM_STATES);
    let mut is_rep_g2 = init_probs(NUM_STATES);
    let mut is_rep0_long = init_probs(NUM_STATES * num_pos_states);
    let mut lit_probs = init_probs((1 << (lc + lp)) * 0x300);
    let mut match_len_choice = init_probs(2);
    let mut match_len_low = init_probs(num_pos_states << 3);
    let mut match_len_mid = init_probs(num_pos_states << 3);
    let mut match_len_high = init_probs(256);
    let mut rep_len_choice = init_probs(2);
    let mut rep_len_low = init_probs(num_pos_states << 3);
    let mut rep_len_mid = init_probs(num_pos_states << 3);
    let mut rep_len_high = init_probs(256);
    let mut dist_slot_coders = init_probs(NUM_LEN_TO_POS_STATES * 64);
    let mut pos_decoders = init_probs(NUM_FULL_DISTANCES - END_POS_MODEL_INDEX);
    let mut align_decoders = init_probs(1 << NUM_ALIGN_BITS);

    let output_limit = if size_known {
        expected_size
    } else {
        MAX_LZMA_BYTES
    };
    let initial_cap = if size_known {
        expected_size
    } else {
        INITIAL_LZMA_BYTES
            .max(dict_size as usize)
            .min(MAX_LZMA_BYTES)
    };
    let mut output = vec![0u8; initial_cap];
    let mut out_pos: usize = 0;

    let mut state: usize = 0;
    let mut rep0: u32 = 0;
    let mut rep1: u32 = 0;
    let mut rep2: u32 = 0;
    let mut rep3: u32 = 0;

    while !size_known || out_pos < expected_size {
        let pos_state = out_pos & pos_mask;

        if rc_dec_decode_bit(&mut rc, &mut is_match, state * num_pos_states + pos_state) == 0 {
            let prev_byte: u8 = if out_pos > 0 { output[out_pos - 1] } else { 0 };
            let lit_state = ((out_pos & ((1 << lp) - 1)) << lc)
                + (if lc > 0 {
                    (prev_byte >> (8 - lc)) as usize
                } else {
                    0
                });
            let prob_offset = lit_state * 0x300;

            let mut symbol: i32 = 1;
            if state >= 7 {
                let mut match_byte = output[out_pos - rep0 as usize - 1] as i32;
                for _bit_index in 0..8 {
                    let match_bit = (match_byte >> 7) & 1;
                    match_byte <<= 1;
                    let bit = rc_dec_decode_bit(
                        &mut rc,
                        &mut lit_probs,
                        prob_offset + (((1 + match_bit) << 8) + symbol) as usize,
                    );
                    symbol = (symbol << 1) | bit;
                    if match_bit != bit {
                        while symbol < 0x100 {
                            symbol = (symbol << 1)
                                | rc_dec_decode_bit(
                                    &mut rc,
                                    &mut lit_probs,
                                    prob_offset + symbol as usize,
                                );
                        }
                        break;
                    }
                }
            } else {
                while symbol < 0x100 {
                    symbol = (symbol << 1)
                        | rc_dec_decode_bit(&mut rc, &mut lit_probs, prob_offset + symbol as usize);
                }
            }

            ensure_capacity(&mut output, out_pos + 1, output_limit)?;
            output[out_pos] = (symbol & 0xff) as u8;
            out_pos += 1;
            state = STATE_AFTER_LITERAL[state];
        } else if rc_dec_decode_bit(&mut rc, &mut is_rep, state) == 0 {
            let len = MATCH_MIN_LEN
                + lzma_decode_match_len(
                    &mut rc,
                    &mut match_len_choice,
                    &mut match_len_low,
                    &mut match_len_mid,
                    &mut match_len_high,
                    pos_state,
                );
            state = STATE_AFTER_MATCH[state];

            let len_state = (len - MATCH_MIN_LEN).min(NUM_LEN_TO_POS_STATES as i32 - 1);
            let dist_slot =
                rc_dec_decode_bit_tree(&mut rc, &mut dist_slot_coders, len_state as usize * 64, 6);

            let dist: u32;
            if dist_slot < 4 {
                dist = dist_slot as u32;
            } else {
                let num_direct_bits = (dist_slot >> 1) - 1;
                let mut d = (((2 | (dist_slot & 1)) << num_direct_bits) as u32) & 0xFFFFFFFF;
                if dist_slot < END_POS_MODEL_INDEX as i32 {
                    d = d.wrapping_add(rc_dec_decode_bit_tree_reverse(
                        &mut rc,
                        &mut pos_decoders,
                        (d as i32 - dist_slot - 1) as usize,
                        num_direct_bits,
                    ) as u32);
                } else {
                    d = d.wrapping_add(
                        (rc_dec_decode_direct_bits(
                            &mut rc,
                            num_direct_bits - NUM_ALIGN_BITS as i32,
                        ) << NUM_ALIGN_BITS) as u32,
                    );
                    d = d.wrapping_add(rc_dec_decode_bit_tree_reverse(
                        &mut rc,
                        &mut align_decoders,
                        0,
                        NUM_ALIGN_BITS as i32,
                    ) as u32);
                }
                dist = d;
            }

            if dist == 0xffffffff {
                if size_known && out_pos != expected_size {
                    return Err("lzma: end marker at wrong position".to_string());
                }
                break;
            }

            rep3 = rep2;
            rep2 = rep1;
            rep1 = rep0;
            rep0 = dist;

            if rep0 as usize >= out_pos {
                return Err("lzma: distance exceeds output position".to_string());
            }
            ensure_capacity(&mut output, out_pos + len as usize, output_limit)?;
            for _ in 0..len {
                output[out_pos] = output[out_pos - rep0 as usize - 1];
                out_pos += 1;
            }
        } else {
            let len: i32;
            if rc_dec_decode_bit(&mut rc, &mut is_rep_g0, state) == 0 {
                if rc_dec_decode_bit(
                    &mut rc,
                    &mut is_rep0_long,
                    state * num_pos_states + pos_state,
                ) == 0
                {
                    if rep0 as usize >= out_pos {
                        return Err("lzma: distance exceeds output position".to_string());
                    }
                    state = STATE_AFTER_SHORT_REP[state];
                    ensure_capacity(&mut output, out_pos + 1, output_limit)?;
                    output[out_pos] = output[out_pos - rep0 as usize - 1];
                    out_pos += 1;
                    continue;
                }
                len = MATCH_MIN_LEN
                    + lzma_decode_match_len(
                        &mut rc,
                        &mut rep_len_choice,
                        &mut rep_len_low,
                        &mut rep_len_mid,
                        &mut rep_len_high,
                        pos_state,
                    );
            } else {
                let tmp: u32;
                if rc_dec_decode_bit(&mut rc, &mut is_rep_g1, state) == 0 {
                    tmp = rep1;
                } else {
                    if rc_dec_decode_bit(&mut rc, &mut is_rep_g2, state) == 0 {
                        tmp = rep2;
                    } else {
                        tmp = rep3;
                        rep3 = rep2;
                    }
                    rep2 = rep1;
                }
                rep1 = rep0;
                rep0 = tmp;
                len = MATCH_MIN_LEN
                    + lzma_decode_match_len(
                        &mut rc,
                        &mut rep_len_choice,
                        &mut rep_len_low,
                        &mut rep_len_mid,
                        &mut rep_len_high,
                        pos_state,
                    );
            }
            state = STATE_AFTER_REP[state];

            if rep0 as usize >= out_pos {
                return Err("lzma: distance exceeds output position".to_string());
            }
            ensure_capacity(&mut output, out_pos + len as usize, output_limit)?;
            for _ in 0..len {
                output[out_pos] = output[out_pos - rep0 as usize - 1];
                out_pos += 1;
            }
        }
    }

    if size_known && out_pos != expected_size {
        return Err("lzma: output size mismatch".to_string());
    }
    return if out_pos == output.len() {
        Ok(output)
    } else {
        Ok(output[..out_pos].to_vec())
    };
}

fn lzma_decode_match_len(
    rc: &mut RcDec,
    choice: &mut [u16],
    low: &mut [u16],
    mid: &mut [u16],
    high: &mut [u16],
    pos_state: usize,
) -> i32 {
    if rc_dec_decode_bit(rc, choice, 0) == 0 {
        return rc_dec_decode_bit_tree(rc, low, pos_state << 3, 3);
    }
    if rc_dec_decode_bit(rc, choice, 1) == 0 {
        return 8 + rc_dec_decode_bit_tree(rc, mid, pos_state << 3, 3);
    }
    return 16 + rc_dec_decode_bit_tree(rc, high, 0, 8);
}

fn rc_dec_decode_bit(rc: &mut RcDec, probs: &mut [u16], index: usize) -> i32 {
    rc_dec_normalize(rc);
    let bound = (rc.range >> PROB_BITS).wrapping_mul(probs[index] as u32);
    if rc.code < bound {
        rc.range = bound;
        probs[index] += ((1u16 << PROB_BITS) - probs[index]) >> MOVE_BITS;
        return 0;
    }
    rc.range = rc.range.wrapping_sub(bound);
    rc.code = rc.code.wrapping_sub(bound);
    probs[index] -= probs[index] >> MOVE_BITS;
    return 1;
}

fn rc_dec_decode_bit_tree(rc: &mut RcDec, probs: &mut [u16], offset: usize, num_bits: i32) -> i32 {
    let mut m: i32 = 1;
    for _ in 0..num_bits {
        m = (m << 1) | rc_dec_decode_bit(rc, probs, offset + m as usize);
    }
    return m - (1 << num_bits);
}

fn rc_dec_decode_bit_tree_reverse(
    rc: &mut RcDec,
    probs: &mut [u16],
    offset: usize,
    num_bits: i32,
) -> i32 {
    let mut m: i32 = 1;
    let mut symbol: i32 = 0;
    for i in 0..num_bits {
        let bit = rc_dec_decode_bit(rc, probs, offset.wrapping_add(m as usize));
        m = (m << 1) | bit;
        symbol |= bit << i;
    }
    return symbol;
}

fn rc_dec_decode_direct_bits(rc: &mut RcDec, count: i32) -> i32 {
    let mut result: i32 = 0;
    for _ in 0..count {
        rc_dec_normalize(rc);
        rc.range = rc.range.wrapping_shr(1);
        result <<= 1;
        if rc.code >= rc.range {
            rc.code = rc.code.wrapping_sub(rc.range);
            result |= 1;
        }
    }
    return result;
}

fn rc_dec_normalize(rc: &mut RcDec) {
    if rc.range < TOP_VALUE {
        rc.range = rc.range.wrapping_shl(8);
        let byte = if rc.pos < rc.input.len() {
            rc.input[rc.pos] as u32
        } else {
            0
        };
        rc.code = rc.code.wrapping_shl(8) | byte;
        rc.pos += 1;
    }
}

const STATE_AFTER_LITERAL: [usize; 12] = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 4, 5];
const STATE_AFTER_MATCH: [usize; 12] = [7, 7, 7, 7, 7, 7, 7, 10, 10, 10, 10, 10];
const STATE_AFTER_REP: [usize; 12] = [8, 8, 8, 8, 8, 8, 8, 11, 11, 11, 11, 11];
const STATE_AFTER_SHORT_REP: [usize; 12] = [9, 9, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11];

const LZMA_HEADER_SIZE: usize = 13;
const LZMA_MIN_DICT_SIZE: u32 = 1 << 12;
const PROB_INIT: u16 = 1024;
const PROB_BITS: u32 = 11;
const MOVE_BITS: u32 = 5;
const TOP_VALUE: u32 = 1 << 24;
const NUM_STATES: usize = 12;
const NUM_LEN_TO_POS_STATES: usize = 4;
const NUM_ALIGN_BITS: usize = 4;
const END_POS_MODEL_INDEX: usize = 14;
const NUM_FULL_DISTANCES: usize = 1 << (END_POS_MODEL_INDEX >> 1);
const MATCH_MIN_LEN: i32 = 2;
const MAX_LZMA_BYTES: usize = 256 * 1024 * 1024;
const INITIAL_LZMA_BYTES: usize = 1024;
