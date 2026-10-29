//! flight-compiler: target-native
//! flight-compiler: contract PathBooleanKernel
//! TypeScript names the generated `PathBooleanKernel` entity record `PathBooleanKernelRaw`, while
//! dependent packages generated from Rust name the Rust type (`flight_path_boolean::PathBooleanKernel`).
//! The target-native `pathBooleanCompat.ts` gives those TypeScript consumers `PathBooleanKernel` as an
//! alias of the record; Rust needs nothing here.
