//! flight-compiler: target-native
//! flight-compiler: contract Path PathMorph
//! TypeScript names the generated `Path` and `PathMorph` entity records `PathRaw` and `PathMorphRaw`,
//! while dependent packages generated from Rust name the Rust types (`flight_path::Path`). The
//! target-native `pathCompat.ts` gives those TypeScript consumers `Path` and `PathMorph` as aliases of
//! the records; Rust needs nothing here.
