// A linear-space RGBA color as four floats in [0, 1] (RGB) / [0, 1] (A). The single
// float representation downstream lighting and shading math consumes. Written by
// `unpackColorToLinear` and safe to keep as a reusable scratch out parameter.
export type LinearColor = [number, number, number, number];
