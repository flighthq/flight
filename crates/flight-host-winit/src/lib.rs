#![doc = include_str!("../README.md")]

mod input_translation;

pub use input_translation::*;

// The host implementation is added beside the independently testable translation seam.
mod winit_host;

pub use winit_host::*;
