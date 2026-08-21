# Physics3D performance qualification

`npm run benchmark:physics3d` is the checked-in, failing performance gate. It exercises both built-in
spatial backends with the collision support, face-query, and closed-form pair registrars enabled:

- **Contact stack:** 256 awake dynamic unit boxes in an 8 x 8 x 4 stack over one static floor, producing
  256 touching contacts after 600 settling steps.
- **Sparse moving:** 256 awake dynamic unit boxes separated by eight world units, producing no contacts.
- **Mixed scale:** 256 awake dynamic boxes on a 25-unit lattice, with half-extents doubling through
  0.5, 1, 2, 4, 8, 16, and 32 units. The default one-unit grid, a workload-tuned 32-unit grid, and the
  BVH run the same 64:1 scene.

Each measurement receives 60 timing warm-up steps, 240 individually timed steps, 120 ordinary steps
bracketed by forced full collections for retained heap growth, and a separate 120-step V8 allocation
sample. CPU time is the failing timing metric because it excludes scheduler pauses on shared CI hosts;
wall-clock p50/p95 is still reported so host contention remains visible.

Absolute timing qualifies the named reference host under quiescent conditions. Process CPU time removes
time while the process is descheduled, but it cannot remove CPU frequency/turbo changes, virtualization
pressure, or V8 runtime-state variance; a materially different or contended machine may report red
without identifying a source regression. A release lane enforcing the timing ceilings therefore needs a
pinned runner. Allocation ceilings remain engine/version-specific for the same reason the report records
Node and hardware metadata.

The V8 sampling profiler is started only after the timed and retained-growth passes. Its
`includeObjectsCollectedByMajorGC` and `includeObjectsCollectedByMinorGC` options deliberately report
transient garbage as well as survivors. Sampling changes V8's observation environment, so its byte
count is an engine-specific regression ceiling rather than an assertion about exact production
allocation throughput. Retained bytes per step are measured separately without the profiler and are the
steady-state growth ceiling.

## Checked-in ceilings

| Scene | p95 CPU time | sampled transient allocation/step | retained heap/step |
| --- | ---: | ---: | ---: |
| Contact stack | 12 ms | 5 MiB | 4 KiB |
| Mixed scale | 20 ms | 4 MiB | 2 KiB |
| Sparse moving | 3 ms | 320 KiB | 2 KiB |

## Spatial workload qualification

The mixed-scale scene gates two clock-independent properties before it times a step. These are the
backend tradeoff itself, rather than a host-dependent proxy for it:

| Backend configuration | Initial indexing modes | Initial candidate pairs |
| --- | ---: | ---: |
| Uniform grid, cell size 1 (the world default) | 160 cells / 96 overflow | 484 |
| Uniform grid, cell size 32 (tuned to the largest bodies) | 256 cells / 0 overflow | 1,536 |
| BVH, margin 0.25 | 256 cells / 0 overflow | 484 |

The default grid therefore routes exactly 37.5% of the bodies through its flat overflow list. Enlarging
the cells removes that scan, but emits 3.17 times as many candidate pairs for collision to reject. The
BVH retains the tighter 484-pair candidate set without a fixed cell length. Those exact mode and pair
counts fail the benchmark if they drift; timing and allocation ceilings qualify their runtime cost.

The choice remains workload-specific. A uniform grid is the intended fast path for worlds whose bodies
are roughly one size; choose a cell size near that typical size. A BVH is the safer explicit choice for
mixed-scale or unbounded worlds where no one cell length fits. `enablePhysics3DGuards()` reports when a
Physics3D world enters overflow, so a correct but unexpectedly linear broadphase is visible without
installing spatial's process-wide caller-composed guard.

The sparse CPU ceiling began at 2 ms, but repeated runs of the unchanged tree on the reference host
produced one 2.342 ms p95 beside a stable 0.525 ms median, followed immediately by a 0.908 ms p95. That
tail is process runtime/collection variance rather than a scene-cost shift. The 3 ms ceiling remains a
material regression gate against the 0.7–1.2 ms reference range without making an otherwise-identical
run nondeterministically red.

## Reference run

Measured 2026-08-21 on Linux 7.0.12 x64, Node v22.22.1, 16 logical CPUs (host-reported CPU model
`19/21`) and 24,714,579,968 bytes of memory:

| Backend | Scene | wall p50 / p95 | CPU p50 / p95 | sampled transient/step | retained/step |
| --- | --- | ---: | ---: | ---: | ---: |
| uniform-grid | contact stack | 3.641 / 4.924 ms | 3.649 / 4.960 ms | 3,709,697 B | 8.467 B |
| uniform-grid | sparse moving | 0.521 / 0.711 ms | 0.528 / 0.716 ms | 191,395 B | 0 B |
| BVH | contact stack | 3.915 / 6.223 ms | 3.970 / 6.211 ms | 3,611,302 B | 23 B |
| BVH | sparse moving | 0.372 / 0.591 ms | 0.376 / 1.154 ms | 233,879 B | 0 B |

The mixed-scale extension on the same reference host measured:

| Backend | Scene | wall p50 / p95 | CPU p50 / p95 | sampled transient/step | retained/step |
| --- | --- | ---: | ---: | ---: | ---: |
| uniform-grid (cell 1) | mixed scale | 3.519 / 5.788 ms | 3.582 / 6.695 ms | 2,872,804 B | 0 B |
| uniform-grid (cell 32) | mixed scale | 2.124 / 2.871 ms | 2.133 / 2.931 ms | 852,314 B | 0 B |
| BVH | mixed scale | 1.825 / 2.903 ms | 1.842 / 3.028 ms | 752,606 B | 0 B |

The contact-stack gate originally measured about 8.3 MiB of sampled transient allocation and 6.5 ms
median step time. Profiling exposed the common box-box path falling through iterative GJK/EPA; the
registered exact 15-axis OBB SAT and removal of hot helper allocations reduced the sampled volume to
about 3.6–3.7 MiB and the median to about 3.6–3.9 ms. The remaining transient profile is dominated by
numeric work inside the sequential-impulse solver, while ordinary forced-GC runs retain effectively
nothing per step.
