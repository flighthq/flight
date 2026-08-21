# Physics3D performance qualification

`npm run benchmark:physics3d` is the checked-in, failing performance gate. It exercises both built-in
spatial backends with the collision support, face-query, and closed-form pair registrars enabled:

- **Contact stack:** 256 awake dynamic unit boxes in an 8 x 8 x 4 stack over one static floor, producing
  256 touching contacts after 600 settling steps.
- **Sparse moving:** 256 awake dynamic unit boxes separated by eight world units, producing no contacts.

Each measurement receives 60 timing warm-up steps, 240 individually timed steps, 120 ordinary steps
bracketed by forced full collections for retained heap growth, and a separate 120-step V8 allocation
sample. CPU time is the failing timing metric because it excludes scheduler pauses on shared CI hosts;
wall-clock p50/p95 is still reported so host contention remains visible.

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
| Sparse moving | 2 ms | 320 KiB | 2 KiB |

## Reference run

Measured 2026-08-21 on Linux 7.0.12 x64, Node v22.22.1, 16 logical CPUs (host-reported CPU model
`19/21`) and 24,714,579,968 bytes of memory:

| Backend | Scene | wall p50 / p95 | CPU p50 / p95 | sampled transient/step | retained/step |
| --- | --- | ---: | ---: | ---: | ---: |
| uniform-grid | contact stack | 3.641 / 4.924 ms | 3.649 / 4.960 ms | 3,709,697 B | 8.467 B |
| uniform-grid | sparse moving | 0.521 / 0.711 ms | 0.528 / 0.716 ms | 191,395 B | 0 B |
| BVH | contact stack | 3.915 / 6.223 ms | 3.970 / 6.211 ms | 3,611,302 B | 23 B |
| BVH | sparse moving | 0.372 / 0.591 ms | 0.376 / 1.154 ms | 233,879 B | 0 B |

The contact-stack gate originally measured about 8.3 MiB of sampled transient allocation and 6.5 ms
median step time. Profiling exposed the common box-box path falling through iterative GJK/EPA; the
registered exact 15-axis OBB SAT and removal of hot helper allocations reduced the sampled volume to
about 3.6–3.7 MiB and the median to about 3.6–3.9 ms. The remaining transient profile is dominated by
numeric work inside the sequential-impulse solver, while ordinary forced-GC runs retain effectively
nothing per step.
