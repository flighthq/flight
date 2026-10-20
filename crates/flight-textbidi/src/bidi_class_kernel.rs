use crate::text_bidi_guards::report_text_bidi_compact_table_miss;
use crate::types::BidiClass;
use crate::types::BidiClassKernel;
use crate::types::BidiClassKernelExplanation;
use crate::types::BidiCodePointRange;

pub fn create_compact_bidi_class_kernel() -> BidiClassKernel {
    let mut out = BidiClassKernel::default();
    initialize_compact_bidi_class_kernel(&mut out);
    out.is_compact = true;
    return out;
}

pub fn initialize_compact_bidi_class_kernel(out: &mut BidiClassKernel) {
    out.get_bidi_class = get_compact_bidi_class;
}

pub fn compact_bidi_class_kernel() -> BidiClassKernel {
    return create_compact_bidi_class_kernel();
}

pub fn explain_bidi_class_kernel(bidi_class_kernel: &BidiClassKernel) -> BidiClassKernelExplanation {
    let compact = bidi_class_kernel.is_compact;
    return BidiClassKernelExplanation {
        kernel: if compact { "compact" } else { "custom" },
        coverage: if compact {
            "common-script-ranges"
        } else {
            "provider-defined"
        },
        covered_code_point_ranges: if compact {
            get_compact_bidi_class_coverage_ranges()
        } else {
            vec![]
        },
        fallback_class: if compact { Some(BidiClass::L) } else { None },
        table_valid: if compact {
            Some(is_compact_bidi_class_table_valid())
        } else {
            None
        },
    };
}

fn get_compact_bidi_class(codepoint: u32) -> BidiClass {
    let range_count = RANGES.len() / 3;
    let mut lo: i32 = 0;
    let mut hi: i32 = range_count as i32 - 1;
    while lo <= hi {
        let mid = ((lo + hi) >> 1) as usize;
        let base = mid * 3;
        let start = RANGES[base];
        if codepoint < start {
            hi = mid as i32 - 1;
        } else if codepoint > RANGES[base + 1] {
            lo = mid as i32 + 1;
        } else {
            return CLASS_ORDER[RANGES[base + 2] as usize];
        }
    }
    report_text_bidi_compact_table_miss(codepoint);
    return BidiClass::L;
}

fn get_compact_bidi_class_coverage_ranges() -> Vec<BidiCodePointRange> {
    let mut out: Vec<BidiCodePointRange> = Vec::new();
    let mut i = 0;
    while i < RANGES.len() {
        out.push(BidiCodePointRange {
            start: RANGES[i],
            end: RANGES[i + 1],
        });
        i += 3;
    }
    return out;
}

fn is_compact_bidi_class_table_valid() -> bool {
    if RANGES.len() % 3 != 0 {
        return false;
    }
    let mut previous_end: i64 = -1;
    let mut i = 0;
    while i < RANGES.len() {
        let start = RANGES[i];
        let end = RANGES[i + 1];
        let ordinal = RANGES[i + 2];
        if start > end || (start as i64) <= previous_end {
            return false;
        }
        if ordinal >= CLASS_ORDER.len() as u32 {
            return false;
        }
        previous_end = end as i64;
        i += 3;
    }
    return true;
}

// Class ordinals used inside the flat range table.
const CLASS_ORDER: [BidiClass; 23] = [
    BidiClass::L,
    BidiClass::R,
    BidiClass::AL,
    BidiClass::EN,
    BidiClass::ES,
    BidiClass::ET,
    BidiClass::AN,
    BidiClass::CS,
    BidiClass::NSM,
    BidiClass::BN,
    BidiClass::B,
    BidiClass::S,
    BidiClass::WS,
    BidiClass::ON,
    BidiClass::LRE,
    BidiClass::RLE,
    BidiClass::LRO,
    BidiClass::RLO,
    BidiClass::PDF,
    BidiClass::LRI,
    BidiClass::RLI,
    BidiClass::FSI,
    BidiClass::PDI,
];

const L: u32 = 0;
const R: u32 = 1;
const AL: u32 = 2;
const EN: u32 = 3;
const ES: u32 = 4;
const ET: u32 = 5;
const AN: u32 = 6;
const CS: u32 = 7;
const NSM: u32 = 8;
const BN: u32 = 9;
const B: u32 = 10;
const S: u32 = 11;
const WS: u32 = 12;
const ON: u32 = 13;
const LRE: u32 = 14;
const RLE: u32 = 15;
const LRO: u32 = 16;
const RLO: u32 = 17;
const PDF: u32 = 18;
const LRI: u32 = 19;
const RLI: u32 = 20;
const FSI: u32 = 21;
const PDI: u32 = 22;

// The sorted, non-overlapping range table, flattened to [start, end, classOrdinal] triples.
#[rustfmt::skip]
const RANGES: &[u32] = &[
    // Basic Latin (C0 controls, ASCII punctuation, digits, letters)
    0x0000, 0x0008, BN,
    0x0009, 0x0009, S,
    0x000A, 0x000A, B,
    0x000B, 0x000B, S,
    0x000C, 0x000C, WS,
    0x000D, 0x000D, B,
    0x000E, 0x001B, BN,
    0x001C, 0x001E, B,
    0x001F, 0x001F, S,
    0x0020, 0x0020, WS,
    0x0021, 0x0022, ON,
    0x0023, 0x0025, ET,
    0x0026, 0x002A, ON,
    0x002B, 0x002B, ES,
    0x002C, 0x002C, CS,
    0x002D, 0x002D, ES,
    0x002E, 0x002F, CS,
    0x0030, 0x0039, EN,
    0x003A, 0x003A, CS,
    0x003B, 0x0040, ON,
    0x0041, 0x005A, L,
    0x005B, 0x0060, ON,
    0x0061, 0x007A, L,
    0x007B, 0x007E, ON,
    0x007F, 0x0084, BN,
    0x0085, 0x0085, B,
    0x0086, 0x009F, BN,
    // Latin-1 Supplement
    0x00A0, 0x00A0, CS,
    0x00A1, 0x00A1, ON,
    0x00A2, 0x00A5, ET,
    0x00A6, 0x00A9, ON,
    0x00AA, 0x00AA, L,
    0x00AB, 0x00AC, ON,
    0x00AD, 0x00AD, BN,
    0x00AE, 0x00AF, ON,
    0x00B0, 0x00B1, ET,
    0x00B2, 0x00B3, EN,
    0x00B4, 0x00B4, ON,
    0x00B5, 0x00B5, L,
    0x00B6, 0x00B8, ON,
    0x00B9, 0x00B9, EN,
    0x00BA, 0x00BA, L,
    0x00BB, 0x00BF, ON,
    0x00C0, 0x00D6, L,
    0x00D7, 0x00D7, ON,
    0x00D8, 0x00F6, L,
    0x00F7, 0x00F7, ON,
    0x00F8, 0x00FF, L,
    // Combining Diacritical Marks
    0x0300, 0x036F, NSM,
    // Hebrew block (letters R; points/accents NSM)
    0x0590, 0x0590, R,
    0x0591, 0x05BD, NSM,
    0x05BE, 0x05BE, R,
    0x05BF, 0x05BF, NSM,
    0x05C0, 0x05C0, R,
    0x05C1, 0x05C2, NSM,
    0x05C3, 0x05C3, R,
    0x05C4, 0x05C5, NSM,
    0x05C6, 0x05C6, R,
    0x05C7, 0x05C7, NSM,
    0x05C8, 0x05FF, R,
    // Arabic block (letters AL; marks NSM; digits AN/EN; separators)
    0x0600, 0x0605, AN,
    0x0606, 0x0607, ON,
    0x0608, 0x0608, AL,
    0x0609, 0x060A, ET,
    0x060B, 0x060B, AL,
    0x060C, 0x060C, CS,
    0x060D, 0x060F, AL,
    0x0610, 0x061A, NSM,
    0x061B, 0x064A, AL,
    0x064B, 0x065F, NSM,
    0x0660, 0x0669, AN,
    0x066A, 0x066A, ET,
    0x066B, 0x066C, AN,
    0x066D, 0x066F, AL,
    0x0670, 0x0670, NSM,
    0x0671, 0x06D5, AL,
    0x06D6, 0x06DC, NSM,
    0x06DD, 0x06DE, AN,
    0x06DF, 0x06E4, NSM,
    0x06E5, 0x06E6, AL,
    0x06E7, 0x06E8, NSM,
    0x06E9, 0x06E9, ON,
    0x06EA, 0x06ED, NSM,
    0x06EE, 0x06EF, AL,
    0x06F0, 0x06F9, EN,
    0x06FA, 0x06FF, AL,
    // Arabic Supplement + Extended-A
    0x0750, 0x077F, AL,
    0x08A0, 0x08FF, AL,
    // General punctuation whitespace/format run
    0x1680, 0x1680, WS,
    0x2000, 0x200A, WS,
    0x200B, 0x200D, BN,
    0x200E, 0x200E, L,
    0x200F, 0x200F, R,
    0x2010, 0x2027, ON,
    0x2028, 0x2028, WS,
    0x2029, 0x2029, B,
    0x202A, 0x202A, LRE,
    0x202B, 0x202B, RLE,
    0x202C, 0x202C, PDF,
    0x202D, 0x202D, LRO,
    0x202E, 0x202E, RLO,
    0x202F, 0x202F, CS,
    0x2030, 0x2034, ET,
    0x2035, 0x2059, ON,
    0x205F, 0x205F, WS,
    0x2060, 0x2064, BN,
    0x2066, 0x2066, LRI,
    0x2067, 0x2067, RLI,
    0x2068, 0x2068, FSI,
    0x2069, 0x2069, PDI,
    // Ideographic space
    0x3000, 0x3000, WS,
    // Hebrew + Arabic presentation forms
    0xFB1D, 0xFB1D, R,
    0xFB1E, 0xFB1E, NSM,
    0xFB1F, 0xFB4F, R,
    0xFB50, 0xFDCF, AL,
    0xFDF0, 0xFDFF, AL,
    0xFE70, 0xFEFE, AL,
    0xFEFF, 0xFEFF, BN,
];
