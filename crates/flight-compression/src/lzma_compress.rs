use flight_entity::throw_error;

use crate::types::{CompressionFraming, HostCompressLzmaCapability};

struct LzmaMatch {
    match_type: i32,
    len: i32,
    dist: i32,
}

// Range coder encoder state.
struct RcEnc {
    out_buf: Vec<u8>,
    out_pos: usize,
    rc_low: u64,
    rc_range: u32,
    rc_cache_size: u32,
    rc_cache: u8,
}

/// The LZMA compress slot Flight itself can fill.
pub fn create_sdk_host_compress_lzma() -> HostCompressLzmaCapability {
    return HostCompressLzmaCapability {
        compress: sdk_host_compress_lzma_compress,
    };
}

/// Compress bytes using the LZMA-alone format.
pub fn compress_lzma(bytes: &[u8]) -> Vec<u8> {
    return lzma_encode(bytes);
}

fn encode_distance(
    rc: &mut RcEnc,
    dist_slot_coders: &mut [u16],
    pos_decoders: &mut [u16],
    align_decoders: &mut [u16],
    dist: i32,
    len_state: i32,
) {
    let dist_slot = get_dist_slot(dist);
    rc_enc_encode_bit_tree(rc, dist_slot_coders, len_state as usize * 64, 6, dist_slot);

    if dist_slot >= 4 {
        let num_direct_bits = (dist_slot >> 1) - 1;
        let base = ((2 | (dist_slot & 1)) << num_direct_bits) as u32;
        let remainder = dist - base as i32;

        if dist_slot < END_POS_MODEL_INDEX as i32 {
            rc_enc_encode_bit_tree_reverse(
                rc,
                pos_decoders,
                (base as i32 - dist_slot - 1) as usize,
                num_direct_bits,
                remainder,
            );
        } else {
            rc_enc_encode_direct_bits(
                rc,
                remainder >> NUM_ALIGN_BITS,
                num_direct_bits - NUM_ALIGN_BITS as i32,
            );
            rc_enc_encode_bit_tree_reverse(
                rc,
                align_decoders,
                0,
                NUM_ALIGN_BITS as i32,
                remainder & ((1 << NUM_ALIGN_BITS) - 1),
            );
        }
    }
}

fn encode_literal(
    rc: &mut RcEnc,
    lit_probs: &mut [u16],
    input: &[u8],
    in_pos: usize,
    cur_byte: u8,
    state: usize,
    rep0: i32,
    lc: u32,
    lp: u32,
) {
    let prev_byte: u8 = if in_pos > 0 { input[in_pos - 1] } else { 0 };
    let lit_state =
        ((in_pos & ((1 << lp) - 1)) << lc) + ((prev_byte >> (8 - lc)) as usize);
    let prob_offset = lit_state * 0x300;

    if state >= 7 {
        let mut match_byte = input[in_pos - rep0 as usize - 1] as i32;
        let mut symbol: i32 = 1;
        for bit_index in 0..8 {
            let match_bit = (match_byte >> 7) & 1;
            match_byte <<= 1;
            let bit = ((cur_byte >> (7 - bit_index)) & 1) as i32;
            rc_enc_encode_bit(
                rc,
                lit_probs,
                prob_offset + (((1 + match_bit) << 8) + symbol) as usize,
                bit,
            );
            symbol = (symbol << 1) | bit;
            if match_bit != bit {
                for j in (bit_index + 1)..8 {
                    let b = ((cur_byte >> (7 - j)) & 1) as i32;
                    rc_enc_encode_bit(rc, lit_probs, prob_offset + symbol as usize, b);
                    symbol = (symbol << 1) | b;
                }
                break;
            }
        }
    } else {
        let mut symbol: i32 = 1;
        for bit_index in 0..8 {
            let bit = ((cur_byte >> (7 - bit_index)) & 1) as i32;
            rc_enc_encode_bit(rc, lit_probs, prob_offset + symbol as usize, bit);
            symbol = (symbol << 1) | bit;
        }
    }
}

fn encode_match_len(
    rc: &mut RcEnc,
    choice: &mut [u16],
    low: &mut [u16],
    mid: &mut [u16],
    high: &mut [u16],
    pos_state: usize,
    len: i32,
) {
    if len < 8 {
        rc_enc_encode_bit(rc, choice, 0, 0);
        rc_enc_encode_bit_tree(rc, low, pos_state << 3, 3, len);
    } else if len < 16 {
        rc_enc_encode_bit(rc, choice, 0, 1);
        rc_enc_encode_bit(rc, choice, 1, 0);
        rc_enc_encode_bit_tree(rc, mid, pos_state << 3, 3, len - 8);
    } else {
        rc_enc_encode_bit(rc, choice, 0, 1);
        rc_enc_encode_bit(rc, choice, 1, 1);
        rc_enc_encode_bit_tree(rc, high, 0, 8, len - 16);
    }
}

fn encode_rep_len(
    rc: &mut RcEnc,
    choice: &mut [u16],
    low: &mut [u16],
    mid: &mut [u16],
    high: &mut [u16],
    pos_state: usize,
    len: i32,
) {
    if len < 8 {
        rc_enc_encode_bit(rc, choice, 0, 0);
        rc_enc_encode_bit_tree(rc, low, pos_state << 3, 3, len);
    } else if len < 16 {
        rc_enc_encode_bit(rc, choice, 0, 1);
        rc_enc_encode_bit(rc, choice, 1, 0);
        rc_enc_encode_bit_tree(rc, mid, pos_state << 3, 3, len - 8);
    } else {
        rc_enc_encode_bit(rc, choice, 0, 1);
        rc_enc_encode_bit(rc, choice, 1, 1);
        rc_enc_encode_bit_tree(rc, high, 0, 8, len - 16);
    }
}

fn get_dist_slot(dist: i32) -> i32 {
    if dist < 4 {
        return dist;
    }
    let mut bits: i32 = 1;
    let mut d = dist;
    while d >= 4 {
        d >>= 1;
        bits += 1;
    }
    return (bits << 1) + ((dist >> (bits - 1)) & 1);
}

fn init_probs(count: usize) -> Vec<u16> {
    return vec![PROB_INIT; count];
}

fn lzma_encode(input: &[u8]) -> Vec<u8> {
    let lc: u32 = 3;
    let lp: u32 = 0;
    let pb: u32 = 2;
    let dict_size = LZMA_MIN_DICT_SIZE.max(nearest_pow2(input.len() as u32));
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

    let initial_out_size = (input.len() + LZMA_HEADER_SIZE + 64).max(INITIAL_OUTPUT_BYTES);
    let mut rc = RcEnc {
        out_buf: vec![0u8; initial_out_size],
        out_pos: 0,
        rc_low: 0,
        rc_range: 0xffffffff,
        rc_cache_size: 1,
        rc_cache: 0,
    };

    // Write header
    let prop_byte = (pb * 45 + lp * 9 + lc) as u8;
    rc_enc_push_byte(&mut rc, prop_byte);
    rc_enc_push_byte(&mut rc, (dict_size & 0xff) as u8);
    rc_enc_push_byte(&mut rc, ((dict_size >> 8) & 0xff) as u8);
    rc_enc_push_byte(&mut rc, ((dict_size >> 16) & 0xff) as u8);
    rc_enc_push_byte(&mut rc, ((dict_size >> 24) & 0xff) as u8);
    rc_enc_push_byte(&mut rc, (input.len() & 0xff) as u8);
    rc_enc_push_byte(&mut rc, ((input.len() >> 8) & 0xff) as u8);
    rc_enc_push_byte(&mut rc, ((input.len() >> 16) & 0xff) as u8);
    rc_enc_push_byte(&mut rc, ((input.len() >> 24) & 0xff) as u8);
    rc_enc_push_byte(&mut rc, 0);
    rc_enc_push_byte(&mut rc, 0);
    rc_enc_push_byte(&mut rc, 0);
    rc_enc_push_byte(&mut rc, 0);

    let mut head: Vec<i32> = vec![-1i32; HASH_SIZE];
    let mut prev: Vec<i32> = vec![-1i32; if input.len() > 0 { input.len() } else { 1 }];

    let mut state: usize = 0;
    let mut rep0: i32 = 0;
    let mut rep1: i32 = 0;
    let mut rep2: i32 = 0;
    let mut rep3: i32 = 0;
    let mut in_pos: usize = 0;

    while in_pos < input.len() {
        let pos_state = in_pos & pos_mask;
        let m = lzma_find_match(input, in_pos, rep0, rep1, rep2, rep3, &mut head, &mut prev);

        if m.match_type == 0 {
            // Literal
            rc_enc_encode_bit(
                &mut rc,
                &mut is_match,
                state * num_pos_states + pos_state,
                0,
            );
            encode_literal(
                &mut rc,
                &mut lit_probs,
                input,
                in_pos,
                input[in_pos],
                state,
                rep0,
                lc,
                lp,
            );
            state = STATE_AFTER_LITERAL[state];
            in_pos += 1;
        } else if m.match_type == 1 {
            // Normal match
            rc_enc_encode_bit(
                &mut rc,
                &mut is_match,
                state * num_pos_states + pos_state,
                1,
            );
            rc_enc_encode_bit(&mut rc, &mut is_rep, state, 0);
            let len = m.len;
            encode_match_len(
                &mut rc,
                &mut match_len_choice,
                &mut match_len_low,
                &mut match_len_mid,
                &mut match_len_high,
                pos_state,
                len - MATCH_MIN_LEN,
            );
            state = STATE_AFTER_MATCH[state];
            let len_state = (len - MATCH_MIN_LEN).min(NUM_LEN_TO_POS_STATES as i32 - 1);
            encode_distance(
                &mut rc,
                &mut dist_slot_coders,
                &mut pos_decoders,
                &mut align_decoders,
                m.dist,
                len_state,
            );
            rep3 = rep2;
            rep2 = rep1;
            rep1 = rep0;
            rep0 = m.dist;
            for i in 1..len {
                lzma_insert_hash(input, in_pos + i as usize, &mut head, &mut prev);
            }
            in_pos += len as usize;
        } else if m.match_type == 5 {
            // Short rep
            rc_enc_encode_bit(
                &mut rc,
                &mut is_match,
                state * num_pos_states + pos_state,
                1,
            );
            rc_enc_encode_bit(&mut rc, &mut is_rep, state, 1);
            rc_enc_encode_bit(&mut rc, &mut is_rep_g0, state, 0);
            rc_enc_encode_bit(
                &mut rc,
                &mut is_rep0_long,
                state * num_pos_states + pos_state,
                0,
            );
            state = STATE_AFTER_SHORT_REP[state];
            in_pos += 1;
        } else {
            // Rep match (type 10-13)
            rc_enc_encode_bit(
                &mut rc,
                &mut is_match,
                state * num_pos_states + pos_state,
                1,
            );
            rc_enc_encode_bit(&mut rc, &mut is_rep, state, 1);
            let rep_index = m.match_type - 10;
            if rep_index == 0 {
                rc_enc_encode_bit(&mut rc, &mut is_rep_g0, state, 0);
                rc_enc_encode_bit(
                    &mut rc,
                    &mut is_rep0_long,
                    state * num_pos_states + pos_state,
                    1,
                );
            } else {
                rc_enc_encode_bit(&mut rc, &mut is_rep_g0, state, 1);
                if rep_index == 1 {
                    rc_enc_encode_bit(&mut rc, &mut is_rep_g1, state, 0);
                } else if rep_index == 2 {
                    rc_enc_encode_bit(&mut rc, &mut is_rep_g1, state, 1);
                    rc_enc_encode_bit(&mut rc, &mut is_rep_g2, state, 0);
                } else {
                    rc_enc_encode_bit(&mut rc, &mut is_rep_g1, state, 1);
                    rc_enc_encode_bit(&mut rc, &mut is_rep_g2, state, 1);
                }
                if rep_index == 1 {
                    let tmp = rep1;
                    rep1 = rep0;
                    rep0 = tmp;
                } else if rep_index == 2 {
                    let tmp = rep2;
                    rep2 = rep1;
                    rep1 = rep0;
                    rep0 = tmp;
                } else {
                    let tmp = rep3;
                    rep3 = rep2;
                    rep2 = rep1;
                    rep1 = rep0;
                    rep0 = tmp;
                }
            }
            let len = m.len;
            encode_rep_len(
                &mut rc,
                &mut rep_len_choice,
                &mut rep_len_low,
                &mut rep_len_mid,
                &mut rep_len_high,
                pos_state,
                len - MATCH_MIN_LEN,
            );
            state = STATE_AFTER_REP[state];
            for i in 1..len {
                lzma_insert_hash(input, in_pos + i as usize, &mut head, &mut prev);
            }
            in_pos += len as usize;
        }
    }

    for _ in 0..5 {
        rc_enc_shift_low(&mut rc);
    }

    return rc.out_buf[..rc.out_pos].to_vec();
}

fn lzma_find_match(
    input: &[u8],
    pos: usize,
    rep0: i32,
    rep1: i32,
    rep2: i32,
    rep3: i32,
    head: &mut [i32],
    prev: &mut [i32],
) -> LzmaMatch {
    let mut best_len: i32 = 1;
    let mut best_dist: i32 = 0;
    let mut best_type: i32 = 0;

    let max_len = (MATCH_MAX_LEN as usize).min(input.len() - pos) as i32;
    if max_len < MATCH_MIN_LEN {
        return LzmaMatch {
            match_type: 0,
            len: 0,
            dist: 0,
        };
    }

    let reps = [rep0, rep1, rep2, rep3];
    for r in 0..4 {
        let d = reps[r];
        if d >= pos as i32 {
            continue;
        }
        let mut rl: i32 = 0;
        while rl < max_len
            && input[pos + rl as usize] == input[(pos as i32 - d - 1 + rl) as usize]
        {
            rl += 1;
        }
        if rl >= MATCH_MIN_LEN && rl > best_len {
            best_len = rl;
            best_dist = d;
            best_type = 10 + r as i32;
            if rl == max_len {
                return LzmaMatch {
                    match_type: best_type,
                    len: best_len,
                    dist: best_dist,
                };
            }
        }
    }

    if (rep0 as usize) < pos && input[pos] == input[pos - rep0 as usize - 1] {
        if best_type == 0 {
            best_type = 5;
            best_len = 1;
            best_dist = rep0;
        }
    }

    if pos + 3 <= input.len() {
        let key = lzma_hash_at(input, pos);
        let mut candidate = head[key];
        let mut attempts = 0;
        while candidate >= 0 && attempts < MAX_CHAIN {
            let distance = pos as i32 - candidate - 1;
            if distance >= MAX_DISTANCE {
                break;
            }
            let mut ml: i32 = 0;
            let limit = max_len.min((input.len() - pos) as i32);
            while ml < limit && input[candidate as usize + ml as usize] == input[pos + ml as usize]
            {
                ml += 1;
            }
            if ml >= MATCH_MIN_LEN && ml > best_len {
                best_len = ml;
                best_dist = distance;
                best_type = 1;
                if ml == max_len {
                    break;
                }
            }
            candidate = prev[candidate as usize];
            attempts += 1;
        }
        prev[pos] = head[key];
        head[key] = pos as i32;
    }

    if best_type == 0 {
        return LzmaMatch {
            match_type: 0,
            len: 0,
            dist: 0,
        };
    }
    return LzmaMatch {
        match_type: best_type,
        len: best_len,
        dist: best_dist,
    };
}

fn lzma_hash_at(input: &[u8], pos: usize) -> usize {
    return (((input[pos] as u32) << 10)
        ^ ((input[pos + 1] as u32) << 5)
        ^ (input[pos + 2] as u32)) as usize
        & HASH_MASK;
}

fn lzma_insert_hash(input: &[u8], pos: usize, head: &mut [i32], prev: &mut [i32]) {
    if pos + 3 <= input.len() {
        let key = lzma_hash_at(input, pos);
        prev[pos] = head[key];
        head[key] = pos as i32;
    }
}

fn nearest_pow2(n: u32) -> u32 {
    if n <= LZMA_MIN_DICT_SIZE {
        return LZMA_MIN_DICT_SIZE;
    }
    let mut p = LZMA_MIN_DICT_SIZE;
    while p < n && p < MAX_DICT_SIZE {
        p <<= 1;
    }
    return p;
}

fn rc_enc_encode_bit(rc: &mut RcEnc, probs: &mut [u16], index: usize, bit: i32) {
    let bound = (rc.rc_range >> PROB_BITS).wrapping_mul(probs[index] as u32);
    if bit == 0 {
        rc.rc_range = bound;
        probs[index] += ((1u16 << PROB_BITS) - probs[index]) >> MOVE_BITS;
    } else {
        rc.rc_low += bound as u64;
        rc.rc_range = rc.rc_range.wrapping_sub(bound);
        probs[index] -= probs[index] >> MOVE_BITS;
    }
    if rc.rc_range < TOP_VALUE {
        rc.rc_range = rc.rc_range.wrapping_shl(8);
        rc_enc_shift_low(rc);
    }
}

fn rc_enc_encode_bit_tree(
    rc: &mut RcEnc,
    probs: &mut [u16],
    offset: usize,
    num_bits: i32,
    value: i32,
) {
    let mut m: i32 = 1;
    for i in (0..num_bits).rev() {
        let bit = (value >> i) & 1;
        rc_enc_encode_bit(rc, probs, offset + m as usize, bit);
        m = (m << 1) | bit;
    }
}

fn rc_enc_encode_bit_tree_reverse(
    rc: &mut RcEnc,
    probs: &mut [u16],
    offset: usize,
    num_bits: i32,
    value: i32,
) {
    let mut m: i32 = 1;
    for i in 0..num_bits {
        let bit = (value >> i) & 1;
        rc_enc_encode_bit(rc, probs, offset.wrapping_add(m as usize), bit);
        m = (m << 1) | bit;
    }
}

fn rc_enc_encode_direct_bits(rc: &mut RcEnc, value: i32, count: i32) {
    for i in (0..count).rev() {
        rc.rc_range = rc.rc_range.wrapping_shr(1);
        if ((value >> i) & 1) == 1 {
            rc.rc_low += rc.rc_range as u64;
        }
        if rc.rc_range < TOP_VALUE {
            rc.rc_range = rc.rc_range.wrapping_shl(8);
            rc_enc_shift_low(rc);
        }
    }
}

fn rc_enc_push_byte(rc: &mut RcEnc, b: u8) {
    if rc.out_pos >= rc.out_buf.len() {
        let mut grown = vec![0u8; rc.out_buf.len() * 2];
        grown[..rc.out_buf.len()].copy_from_slice(&rc.out_buf);
        rc.out_buf = grown;
    }
    rc.out_buf[rc.out_pos] = b;
    rc.out_pos += 1;
}

fn rc_enc_shift_low(rc: &mut RcEnc) {
    let low_hi = (rc.rc_low >> 32) as u32;
    if low_hi != 0 || rc.rc_low < 0xff000000 {
        let mut temp = rc.rc_cache;
        loop {
            rc_enc_push_byte(rc, temp.wrapping_add(low_hi as u8));
            temp = 0xff;
            rc.rc_cache_size -= 1;
            if rc.rc_cache_size == 0 {
                break;
            }
        }
        rc.rc_cache = ((rc.rc_low as u32) >> 24) as u8;
    }
    rc.rc_cache_size += 1;
    rc.rc_low = (rc.rc_low as u32).wrapping_shl(8) as u64;
}

fn sdk_host_compress_lzma_compress(bytes: &[u8], framing: CompressionFraming) -> Vec<u8> {
    if framing != CompressionFraming::Raw {
        throw_error("lzma: only Raw framing is supported");
    }
    return compress_lzma(bytes);
}

const STATE_AFTER_LITERAL: [usize; 12] = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 4, 5];
const STATE_AFTER_MATCH: [usize; 12] = [7, 7, 7, 7, 7, 7, 7, 10, 10, 10, 10, 10];
const STATE_AFTER_REP: [usize; 12] = [8, 8, 8, 8, 8, 8, 8, 11, 11, 11, 11, 11];
const STATE_AFTER_SHORT_REP: [usize; 12] = [9, 9, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11];

const LZMA_HEADER_SIZE: usize = 13;
const LZMA_MIN_DICT_SIZE: u32 = 1 << 12;
const MAX_DICT_SIZE: u32 = 1 << 25;
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
const MATCH_MAX_LEN: i32 = MATCH_MIN_LEN + 271;
const INITIAL_OUTPUT_BYTES: usize = 1024;
const HASH_BITS: usize = 15;
const HASH_MASK: usize = (1 << HASH_BITS) - 1;
const HASH_SIZE: usize = 1 << HASH_BITS;
const MAX_CHAIN: i32 = 32;
const MAX_DISTANCE: i32 = 1 << 25;
