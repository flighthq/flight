use regex::Regex;

use crate::spine_binary_reader::{
    create_spine_binary_reader, is_spine_binary_reader_overrun, read_spine_binary_string,
    skip_spine_binary_bytes,
};
use crate::types::{SpineBinaryVersionFailure, SpineBinaryVersionFailureReason};

const SPINE_BINARY_V4_HASH_BYTES: usize = 8;
const SPINE_BINARY_MINIMUM_HEADER_BYTES: usize = 10;

pub fn explain_spine_binary_version_failure(bytes: &[u8]) -> SpineBinaryVersionFailure {
    let v3_candidate = read_spine_binary_version_v3(bytes);
    let v4_candidate = read_spine_binary_version_v4(bytes);
    let reason = if bytes.len() < SPINE_BINARY_MINIMUM_HEADER_BYTES {
        SpineBinaryVersionFailureReason::TooShort
    } else if v3_candidate.is_some() && v4_candidate.is_some() {
        SpineBinaryVersionFailureReason::StrategiesDisagree
    } else {
        SpineBinaryVersionFailureReason::NoStrategyMatched
    };
    return SpineBinaryVersionFailure {
        bytes: bytes.len(),
        reason,
        v3_candidate,
        v4_candidate,
    };
}

pub fn get_spine_binary_version(bytes: &[u8]) -> Option<String> {
    if bytes.len() < SPINE_BINARY_MINIMUM_HEADER_BYTES {
        return None;
    }
    let v3 = read_spine_binary_version_v3(bytes);
    let v4 = read_spine_binary_version_v4(bytes);
    if v3.is_some() && v4.is_some() {
        return None;
    }
    return v3.or(v4);
}

fn is_printable_ascii(value: &str) -> bool {
    return !value.is_empty() && value.bytes().all(|byte| (0x20..=0x7e).contains(&byte));
}

fn is_version_shaped(value: &str) -> bool {
    let pattern = Regex::new(r"^\d+\.\d+(\.\d+)?$").expect("static version regex");
    return pattern.is_match(value);
}

fn read_spine_binary_version_v3(bytes: &[u8]) -> Option<String> {
    let mut reader = create_spine_binary_reader(bytes);
    let hash = read_spine_binary_string(&mut reader)?;
    if is_spine_binary_reader_overrun(&reader) || !is_printable_ascii(&hash) {
        return None;
    }
    let version = read_spine_binary_string(&mut reader)?;
    if is_spine_binary_reader_overrun(&reader) || !is_version_shaped(&version) {
        return None;
    }
    return Some(version);
}

fn read_spine_binary_version_v4(bytes: &[u8]) -> Option<String> {
    let mut reader = create_spine_binary_reader(bytes);
    skip_spine_binary_bytes(&mut reader, SPINE_BINARY_V4_HASH_BYTES);
    let version = read_spine_binary_string(&mut reader)?;
    if is_spine_binary_reader_overrun(&reader) || !is_version_shaped(&version) {
        return None;
    }
    return Some(version);
}
