//! flight-compiler: target-native

use std::collections::HashMap;

use crate::types::BidiClass;
use crate::types::BidiClassKernel;
use crate::types::BidiDirection;

struct LevelRun {
    indices: Vec<usize>,
    kept_start: usize,
    kept_end: usize,
}

fn apply_explicit_levels(
    original: &[BidiClass],
    working: &mut [BidiClass],
    level_array: &mut [i32],
    matching_pdi: &[i32],
    paragraph_level: i32,
) {
    const MAX_DEPTH: i32 = 125;
    let mut stack_level: Vec<i32> = vec![paragraph_level];
    let mut stack_override: Vec<Option<BidiClass>> = vec![None];
    let mut stack_isolate: Vec<bool> = vec![false];
    let mut overflow_isolate: i32 = 0;
    let mut overflow_embedding: i32 = 0;
    let mut valid_isolate: i32 = 0;

    for i in 0..original.len() {
        let t = original[i];
        let top = stack_level.len() - 1;
        match t {
            BidiClass::RLE | BidiClass::LRE | BidiClass::RLO | BidiClass::LRO => {
                level_array[i] = stack_level[top];
                working[i] = BidiClass::BN;
                let new_level = if t == BidiClass::RLE || t == BidiClass::RLO {
                    next_odd(stack_level[top])
                } else {
                    next_even(stack_level[top])
                };
                if new_level <= MAX_DEPTH && overflow_isolate == 0 && overflow_embedding == 0 {
                    stack_level.push(new_level);
                    stack_override.push(if t == BidiClass::RLO {
                        Some(BidiClass::R)
                    } else if t == BidiClass::LRO {
                        Some(BidiClass::L)
                    } else {
                        None
                    });
                    stack_isolate.push(false);
                } else if overflow_isolate == 0 {
                    overflow_embedding += 1;
                }
            }
            BidiClass::RLI | BidiClass::LRI | BidiClass::FSI => {
                level_array[i] = stack_level[top];
                if stack_override[top].is_some() {
                    working[i] = stack_override[top].unwrap();
                }
                let mut as_rtl = t == BidiClass::RLI;
                if t == BidiClass::FSI {
                    as_rtl =
                        compute_paragraph_level(original, i + 1, matching_pdi[i] as usize) == 1;
                }
                let new_level = if as_rtl {
                    next_odd(stack_level[top])
                } else {
                    next_even(stack_level[top])
                };
                if new_level <= MAX_DEPTH && overflow_isolate == 0 && overflow_embedding == 0 {
                    valid_isolate += 1;
                    stack_level.push(new_level);
                    stack_override.push(None);
                    stack_isolate.push(true);
                } else {
                    overflow_isolate += 1;
                }
            }
            BidiClass::PDI => {
                if overflow_isolate > 0 {
                    overflow_isolate -= 1;
                } else if valid_isolate > 0 {
                    overflow_embedding = 0;
                    while !stack_isolate[stack_level.len() - 1] {
                        stack_level.pop();
                        stack_override.pop();
                        stack_isolate.pop();
                    }
                    stack_level.pop();
                    stack_override.pop();
                    stack_isolate.pop();
                    valid_isolate -= 1;
                }
                let new_top = stack_level.len() - 1;
                level_array[i] = stack_level[new_top];
                if stack_override[new_top].is_some() {
                    working[i] = stack_override[new_top].unwrap();
                }
            }
            BidiClass::PDF => {
                if overflow_isolate > 0 {
                    // isolate overflow shields embeddings; leave the stack alone
                } else if overflow_embedding > 0 {
                    overflow_embedding -= 1;
                } else if !stack_isolate[top] && stack_level.len() >= 2 {
                    stack_level.pop();
                    stack_override.pop();
                    stack_isolate.pop();
                }
                level_array[i] = stack_level[stack_level.len() - 1];
                working[i] = BidiClass::BN;
            }
            BidiClass::B => {
                stack_level.truncate(1);
                stack_override.truncate(1);
                stack_isolate.truncate(1);
                overflow_isolate = 0;
                overflow_embedding = 0;
                valid_isolate = 0;
                level_array[i] = paragraph_level;
            }
            BidiClass::BN => {
                level_array[i] = stack_level[top];
            }
            _ => {
                level_array[i] = stack_level[top];
                if stack_override[top].is_some() {
                    working[i] = stack_override[top].unwrap();
                }
            }
        }
    }
}

fn apply_line_reset(original: &[BidiClass], level_array: &mut [i32], paragraph_level: i32) {
    let length = original.len();
    for i in 0..length {
        let t = original[i];
        if t == BidiClass::B || t == BidiClass::S {
            level_array[i] = paragraph_level;
            let mut j = i as isize - 1;
            while j >= 0 && is_reset_type(original[j as usize]) {
                level_array[j as usize] = paragraph_level;
                j -= 1;
            }
        }
    }
    let mut j = length as isize - 1;
    while j >= 0 && is_reset_type(original[j as usize]) {
        level_array[j as usize] = paragraph_level;
        j -= 1;
    }
}

fn codepoint_at_utf16(utf16: &[u16], i: usize) -> u32 {
    let unit = utf16[i] as u32;
    if (0xD800..=0xDBFF).contains(&unit) && i + 1 < utf16.len() {
        let low = utf16[i + 1] as u32;
        if (0xDC00..=0xDFFF).contains(&low) {
            return 0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00);
        }
    }
    return unit;
}

fn compute_paragraph_level(types: &[BidiClass], start: usize, end: usize) -> i32 {
    let mut isolate_depth: i32 = 0;
    for &t in &types[start..end] {
        if t == BidiClass::LRI || t == BidiClass::RLI || t == BidiClass::FSI {
            isolate_depth += 1;
        } else if t == BidiClass::PDI {
            if isolate_depth > 0 {
                isolate_depth -= 1;
            }
        } else if isolate_depth == 0 {
            if t == BidiClass::L {
                return 0;
            }
            if t == BidiClass::R || t == BidiClass::AL {
                return 1;
            }
        }
    }
    return 0;
}

fn get_bidi_bracket_closing(codepoint: u32) -> Option<u32> {
    let mut i = 0;
    while i < BIDI_BRACKET_PAIRS.len() {
        if BIDI_BRACKET_PAIRS[i] == codepoint {
            return Some(BIDI_BRACKET_PAIRS[i + 1]);
        }
        i += 2;
    }
    return None;
}

fn is_neutral_or_isolate(t: BidiClass) -> bool {
    return t == BidiClass::B
        || t == BidiClass::S
        || t == BidiClass::WS
        || t == BidiClass::ON
        || t == BidiClass::FSI
        || t == BidiClass::LRI
        || t == BidiClass::RLI
        || t == BidiClass::PDI;
}

fn is_reset_type(t: BidiClass) -> bool {
    return t == BidiClass::WS
        || t == BidiClass::LRI
        || t == BidiClass::RLI
        || t == BidiClass::FSI
        || t == BidiClass::PDI
        || t == BidiClass::LRE
        || t == BidiClass::RLE
        || t == BidiClass::LRO
        || t == BidiClass::RLO
        || t == BidiClass::PDF
        || t == BidiClass::BN;
}

fn neutral_direction(t: BidiClass) -> BidiClass {
    return if t == BidiClass::L {
        BidiClass::L
    } else {
        BidiClass::R
    };
}

fn next_even(level: i32) -> i32 {
    return (level + 2) & !1;
}

fn next_odd(level: i32) -> i32 {
    return (level + 1) | 1;
}

fn pair_isolates(types: &[BidiClass], matching_pdi: &mut [i32], matching_initiator: &mut [i32]) {
    let mut stack: Vec<usize> = Vec::new();
    for i in 0..types.len() {
        let t = types[i];
        if t == BidiClass::LRI || t == BidiClass::RLI || t == BidiClass::FSI {
            stack.push(i);
        } else if t == BidiClass::PDI && !stack.is_empty() {
            let initiator = stack.pop().unwrap();
            matching_pdi[initiator] = i as i32;
            matching_initiator[i] = initiator as i32;
        }
    }
}

// flight-lint: allow(conform-params) Principal3139d09f D24: required first caller-owned byte buffer retains capacity while its logical length follows UTF16 code units; original kernel and UBA calculation are unchanged
pub fn resolve_bidi_levels(
    out: &mut Vec<u8>,
    bidi_class_kernel: &BidiClassKernel,
    text: &str,
    base_direction: BidiDirection,
) {
    out.clear();
    let utf16: Vec<u16> = text.encode_utf16().collect();
    let length = utf16.len();
    out.resize(length, 0);
    if length == 0 {
        return;
    }

    let get_bidi_class = bidi_class_kernel.get_bidi_class;
    let mut codepoints: Vec<u32> = vec![0; length];
    let mut original: Vec<BidiClass> = vec![BidiClass::L; length];
    let mut i: usize = 0;
    while i < length {
        let codepoint = codepoint_at_utf16(&utf16, i);
        let cls = get_bidi_class(codepoint);
        codepoints[i] = codepoint;
        original[i] = cls;
        if codepoint > 0xFFFF {
            codepoints[i + 1] = codepoint;
            original[i + 1] = cls;
            i += 1;
        }
        i += 1;
    }

    let paragraph_level: i32 = if base_direction == BidiDirection::Ltr {
        0
    } else if base_direction == BidiDirection::Rtl {
        1
    } else {
        compute_paragraph_level(&original, 0, length)
    };

    let mut matching_pdi: Vec<i32> = vec![length as i32; length];
    let mut matching_initiator: Vec<i32> = vec![-1; length];
    pair_isolates(&original, &mut matching_pdi, &mut matching_initiator);

    let mut working: Vec<BidiClass> = original.clone();
    let mut level_array: Vec<i32> = vec![0; length];
    apply_explicit_levels(
        &original,
        &mut working,
        &mut level_array,
        &matching_pdi,
        paragraph_level,
    );
    resolve_isolating_run_sequences(
        &codepoints,
        &original,
        &mut working,
        &mut level_array,
        &matching_pdi,
        &matching_initiator,
        paragraph_level,
    );
    apply_line_reset(&original, &mut level_array, paragraph_level);

    for i in 0..length {
        out[i] = level_array[i] as u8;
    }
    return;
}

fn resolve_isolating_run_sequences(
    codepoints: &[u32],
    original: &[BidiClass],
    working: &mut [BidiClass],
    level_array: &mut [i32],
    matching_pdi: &[i32],
    matching_initiator: &[i32],
    paragraph_level: i32,
) {
    let length = original.len();

    let mut kept: Vec<usize> = Vec::new();
    for (i, &bidi_class) in working.iter().enumerate().take(length) {
        if bidi_class != BidiClass::BN {
            kept.push(i);
        }
    }
    if kept.is_empty() {
        return;
    }

    let mut runs: Vec<LevelRun> = Vec::new();
    let mut run_start: usize = 0;
    let mut k: usize = 1;
    while k <= kept.len() {
        if k == kept.len() || level_array[kept[k]] != level_array[kept[run_start]] {
            let indices = kept[run_start..k].to_vec();
            runs.push(LevelRun {
                indices,
                kept_start: run_start,
                kept_end: k,
            });
            run_start = k;
        }
        k += 1;
    }

    let mut run_by_first: HashMap<usize, usize> = HashMap::new();
    for (r, run) in runs.iter().enumerate() {
        run_by_first.insert(run.indices[0], r);
    }

    for r in 0..runs.len() {
        let first_idx = runs[r].indices[0];
        if original[first_idx] == BidiClass::PDI && matching_initiator[first_idx] != -1 {
            continue;
        }

        let mut sequence: Vec<usize> = Vec::new();
        let kept_start = runs[r].kept_start;
        #[allow(unused_assignments)]
        let mut kept_end = runs[r].kept_end;
        let mut current = r;
        loop {
            let run = &runs[current];
            for m in 0..run.indices.len() {
                sequence.push(run.indices[m]);
            }
            kept_end = run.kept_end;
            let last_idx = *run.indices.last().unwrap();
            let last_type = original[last_idx];
            if (last_type == BidiClass::LRI
                || last_type == BidiClass::RLI
                || last_type == BidiClass::FSI)
                && (matching_pdi[last_idx] as usize) < length
            {
                if let Some(&next) = run_by_first.get(&(matching_pdi[last_idx] as usize)) {
                    current = next;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        resolve_sequence(
            codepoints,
            original,
            working,
            level_array,
            &kept,
            &sequence,
            kept_start,
            kept_end,
            matching_pdi,
            paragraph_level,
        );
    }
}

fn resolve_paired_brackets(
    codepoints: &[u32],
    sequence: &[usize],
    types: &mut [BidiClass],
    embedding_direction: BidiClass,
    sos: BidiClass,
) {
    let mut stack: Vec<(u32, usize)> = Vec::new(); // (closing codepoint, position)
    let mut pairs: Vec<(usize, usize)> = Vec::new(); // (open, close)

    for i in 0..sequence.len() {
        if types[i] != BidiClass::ON {
            continue;
        }
        let codepoint = codepoints[sequence[i]];
        if let Some(closing) = get_bidi_bracket_closing(codepoint) {
            if stack.len() == 63 {
                break;
            }
            stack.push((closing, i));
            continue;
        }
        for s in (0..stack.len()).rev() {
            if stack[s].0 != codepoint {
                continue;
            }
            pairs.push((stack[s].1, i));
            stack.truncate(s);
            break;
        }
    }

    pairs.sort_by_key(|p| p.0);
    let opposite_direction: BidiClass = if embedding_direction == BidiClass::L {
        BidiClass::R
    } else {
        BidiClass::L
    };

    for &(open, close) in &pairs {
        let mut contains_embedding_direction = false;
        let mut contains_opposite_direction = false;
        for &bidi_class in &types[(open + 1)..close] {
            let direction = strong_bidi_direction(bidi_class);
            if direction == Some(embedding_direction) {
                contains_embedding_direction = true;
                break;
            }
            if direction == Some(opposite_direction) {
                contains_opposite_direction = true;
            }
        }

        let mut resolved: Option<BidiClass> = None;
        if contains_embedding_direction {
            resolved = Some(embedding_direction);
        } else if contains_opposite_direction {
            let mut preceding_direction = strong_bidi_direction(sos).unwrap();
            if open > 0 {
                for i in (0..open).rev() {
                    if let Some(direction) = strong_bidi_direction(types[i]) {
                        preceding_direction = direction;
                        break;
                    }
                }
            }
            resolved = Some(if preceding_direction == opposite_direction {
                opposite_direction
            } else {
                embedding_direction
            });
        }
        if let Some(resolved) = resolved {
            types[open] = resolved;
            types[close] = resolved;
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn resolve_sequence(
    codepoints: &[u32],
    original: &[BidiClass],
    _working: &mut [BidiClass],
    level_array: &mut [i32],
    kept: &[usize],
    sequence: &[usize],
    kept_start: usize,
    kept_end: usize,
    matching_pdi: &[i32],
    paragraph_level: i32,
) {
    let seq_level = level_array[sequence[0]];

    let prev_level = if kept_start > 0 {
        level_array[kept[kept_start - 1]]
    } else {
        paragraph_level
    };
    let sos: BidiClass = if (seq_level.max(prev_level)) % 2 == 1 {
        BidiClass::R
    } else {
        BidiClass::L
    };
    let last_idx = sequence[sequence.len() - 1];
    let last_type = original[last_idx];
    let ends_unmatched_isolate =
        (last_type == BidiClass::LRI || last_type == BidiClass::RLI || last_type == BidiClass::FSI)
            && matching_pdi[last_idx] >= original.len() as i32;
    let next_level = if ends_unmatched_isolate {
        paragraph_level
    } else if kept_end < kept.len() {
        level_array[kept[kept_end]]
    } else {
        paragraph_level
    };
    let eos: BidiClass = if (seq_level.max(next_level)) % 2 == 1 {
        BidiClass::R
    } else {
        BidiClass::L
    };

    let len = sequence.len();
    let mut ty: Vec<BidiClass> = sequence.iter().map(|&index| _working[index]).collect();

    // W1: resolve NSM
    let mut prev: BidiClass = sos;
    for bidi_class in &mut ty {
        if *bidi_class == BidiClass::NSM {
            *bidi_class = if prev == BidiClass::LRI
                || prev == BidiClass::RLI
                || prev == BidiClass::FSI
                || prev == BidiClass::PDI
            {
                BidiClass::ON
            } else {
                prev
            };
        }
        prev = *bidi_class;
    }

    // W2: EN after AL becomes AN
    let mut strong: BidiClass = sos;
    for bidi_class in &mut ty {
        let c = *bidi_class;
        if c == BidiClass::L || c == BidiClass::R || c == BidiClass::AL {
            strong = c;
        } else if c == BidiClass::EN && strong == BidiClass::AL {
            *bidi_class = BidiClass::AN;
        }
    }

    // W3: AL becomes R
    for bidi_class in &mut ty {
        if *bidi_class == BidiClass::AL {
            *bidi_class = BidiClass::R;
        }
    }

    // W4: single ES between two ENs, or single CS between same-type numbers
    for k in 1..len.saturating_sub(1) {
        let c = ty[k];
        if c == BidiClass::ES && ty[k - 1] == BidiClass::EN && ty[k + 1] == BidiClass::EN {
            ty[k] = BidiClass::EN;
        } else if c == BidiClass::CS {
            if ty[k - 1] == BidiClass::EN && ty[k + 1] == BidiClass::EN {
                ty[k] = BidiClass::EN;
            } else if ty[k - 1] == BidiClass::AN && ty[k + 1] == BidiClass::AN {
                ty[k] = BidiClass::AN;
            }
        }
    }

    // W5: ET adjacent to EN becomes EN
    {
        let mut k: usize = 0;
        while k < len {
            if ty[k] == BidiClass::ET {
                let mut j = k;
                while j < len && ty[j] == BidiClass::ET {
                    j += 1;
                }
                let before = if k > 0 { ty[k - 1] } else { sos };
                let after = if j < len { ty[j] } else { eos };
                if before == BidiClass::EN || after == BidiClass::EN {
                    ty[k..j].fill(BidiClass::EN);
                }
                k = j;
            } else {
                k += 1;
            }
        }
    }

    // W6: remaining ES/ET/CS becomes ON
    for bidi_class in &mut ty {
        if *bidi_class == BidiClass::ES
            || *bidi_class == BidiClass::ET
            || *bidi_class == BidiClass::CS
        {
            *bidi_class = BidiClass::ON;
        }
    }

    // W7: EN after L becomes L
    strong = sos;
    for bidi_class in &mut ty {
        let c = *bidi_class;
        if c == BidiClass::L || c == BidiClass::R {
            strong = c;
        } else if c == BidiClass::EN && strong == BidiClass::L {
            *bidi_class = BidiClass::L;
        }
    }

    // N0: paired brackets
    let embedding_dir: BidiClass = if seq_level % 2 == 1 {
        BidiClass::R
    } else {
        BidiClass::L
    };
    resolve_paired_brackets(codepoints, sequence, &mut ty, embedding_dir, sos);

    // N1/N2: neutrals
    {
        let mut k: usize = 0;
        while k < len {
            if is_neutral_or_isolate(ty[k]) {
                let mut j = k;
                while j < len && is_neutral_or_isolate(ty[j]) {
                    j += 1;
                }
                let before = if k > 0 {
                    neutral_direction(ty[k - 1])
                } else {
                    sos
                };
                let after = if j < len {
                    neutral_direction(ty[j])
                } else {
                    eos
                };
                let resolved = if before == after {
                    before
                } else {
                    embedding_dir
                };
                ty[k..j].fill(resolved);
                k = j;
            } else {
                k += 1;
            }
        }
    }

    // I1/I2: implicit levels
    let even = seq_level % 2 == 0;
    for k in 0..len {
        let c = ty[k];
        let mut lvl = seq_level;
        if even {
            if c == BidiClass::R {
                lvl = seq_level + 1;
            } else if c == BidiClass::AN || c == BidiClass::EN {
                lvl = seq_level + 2;
            }
        } else if c == BidiClass::L || c == BidiClass::EN || c == BidiClass::AN {
            lvl = seq_level + 1;
        }
        level_array[sequence[k]] = lvl;
    }
}

fn strong_bidi_direction(t: BidiClass) -> Option<BidiClass> {
    if t == BidiClass::L {
        return Some(BidiClass::L);
    }
    if t == BidiClass::R || t == BidiClass::EN || t == BidiClass::AN {
        return Some(BidiClass::R);
    }
    return None;
}

#[rustfmt::skip]
const BIDI_BRACKET_PAIRS: &[u32] = &[
    0x0028, 0x0029, 0x005B, 0x005D, 0x007B, 0x007D, 0x0F3A, 0x0F3B, 0x0F3C, 0x0F3D, 0x169B, 0x169C, 0x2045, 0x2046,
    0x207D, 0x207E, 0x208D, 0x208E, 0x2308, 0x2309, 0x230A, 0x230B, 0x2329, 0x232A, 0x2768, 0x2769, 0x276A, 0x276B,
    0x276C, 0x276D, 0x276E, 0x276F, 0x2770, 0x2771, 0x2772, 0x2773, 0x2774, 0x2775, 0x27C5, 0x27C6, 0x27E6, 0x27E7,
    0x27E8, 0x27E9, 0x27EA, 0x27EB, 0x27EC, 0x27ED, 0x27EE, 0x27EF, 0x2983, 0x2984, 0x2985, 0x2986, 0x2987, 0x2988,
    0x2989, 0x298A, 0x298B, 0x298C, 0x298D, 0x2990, 0x298E, 0x298F, 0x2991, 0x2992, 0x2993, 0x2994, 0x2995, 0x2996,
    0x2997, 0x2998, 0x29D8, 0x29D9, 0x29DA, 0x29DB, 0x29FC, 0x29FD, 0x2E22, 0x2E23, 0x2E24, 0x2E25, 0x2E26, 0x2E27,
    0x2E28, 0x2E29, 0x3008, 0x3009, 0x300A, 0x300B, 0x300C, 0x300D, 0x300E, 0x300F, 0x3010, 0x3011, 0x3014, 0x3015,
    0x3016, 0x3017, 0x3018, 0x3019, 0x301A, 0x301B, 0xFE59, 0xFE5A, 0xFE5B, 0xFE5C, 0xFE5D, 0xFE5E, 0xFF08, 0xFF09,
    0xFF3B, 0xFF3D, 0xFF5B, 0xFF5D, 0xFF5F, 0xFF60, 0xFF62, 0xFF63,
];
