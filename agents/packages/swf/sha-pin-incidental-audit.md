---
package: '@flighthq/swf'
updated: 2026-08-05
scope: data-only-incidental-inventory
---

# Incidental non-ancestor SHA-token inventory

Generated 2026-08-05 from builder4 commit `f370d5d96`, with local `origin/develop` at
`a3707655f`. A token is included when it resolves locally as a Git commit but
`git merge-base --is-ancestor <token> origin/develop` returns false. Third-party revisions and hashes
that do not resolve as Flight commits are excluded.

Count correction: the original incidental count of 16 included `0099a0cc4`, which the scoped audit then
classified and repaired. The current tree contains 15 still-unclassified non-ancestor tokens. The complete
original inventory below therefore has one resolved entry plus 15 data-only entries. The 15 current tokens
account for 207 occurrences across 43 files. No cross-cell file was changed for them.

## 1. `0099a0cc4` — `test(swf): capture alpha transform backend evidence`

- Original location: `agents/packages/scene2d-wgpu/status.md:49`; the current line names reachable subject
  twin `541a361a5`.
- Read: historical SWF evidence citation; classified and repaired by the scoped audit.

## 2. `0ee47767` — `refactor: rename boolean predicates and equals functions for naming consistency`

- `agents/packages/clip/review.md:19,57`
- Read: historical live-tree/review citation.

## 3. `23fcf86c` — `refactor(node): collapse invalidate<Subject> family into one invalidateContent(node)`

- `agents/packages/shape/review.md:18`
- `agents/packages/node/review.md:17,21,57`
- Read: historical cross-cell implementation citation.

## 4. `30d20a43` — `feat(font): detect format, load-status queries, escape names, url-infer rename`

- `agents/packages/font/assessment.md:9`
- `agents/packages/font/review.md:13`
- Read: historical review/deepening citation.

## 5. `3240ad45e` — `test(clipboard): route test literals through ClipboardFormat constants`

- `agents/packages/clipboard/assessment.md:20`
- `agents/packages/clipboard/review.md:46`
- `agents/packages/clipboard/status.md:17`
- Read: historical test-migration citation.

## 6. `52004502` — `feat(audio): bring AudioResource lifecycle to image parity`

- `agents/packages/audio/review.md:13`
- Read: historical review/deepening citation.

## 7. `6cc3b346` — `refactor(shape): type the command buffer as ShapeCommandToken (drop unknown[])`

- `agents/packages/shape/review.md:18`
- Read: historical implementation citation nested in the Shape review.

## 8. `75c4076b` — `feat(movieclip): extract movieclip package from timeline + spritesheet`

- `agents/packages/timeline/assessment.md:9`
- `agents/packages/timeline/review.md:23`
- Read: historical package-extraction citation.

## 9. `7ec54aea` — `refactor(adjustments): fold color transform into the batch draw, drop CT material kinds`

- `agents/packages/scene2d/review.md:24`
- Read: historical color-adjustment implementation citation.

## 10. `8136a6aa3` — `refactor(textlayout): remove unused _text parameter from query functions`

- `agents/packages/textlayout/review.md:83`
- `agents/packages/textlayout/status.md:18`
- Read: historical cleanup citation.

## 11. `b2824e3d8` — `chore: add missing files`

- `agents/packages/connectivity/review.md:11`
- `agents/packages/text/review.md:8,14,16,26,28,30,32,34,40,44`
- `agents/packages/types/review.md:10`
- `agents/packages/updater/review.md:16,18,28,29,36,37,38,45`
- `agents/packages/scene2d-gl/assessment.md:9,39`
- `agents/packages/host-electron/review.md:8,14,18,26,36,38,51,53,57,75`
- `agents/packages/scene2d-gl/review.md:12,21,27,41,51,71`
- `agents/packages/texture/review.md:13,16,18,26,32,44,50,64`
- `agents/packages/velocity/review.md:16`
- `agents/packages/platform/review.md:16`
- `agents/packages/notification/review.md:19`
- `agents/packages/surface-rs/review.md:8,17,21,29,31,38,46,58,63,68`
- `agents/packages/sdk/review.md:12,15,17,37,41,50,51`
- `agents/packages/haptics/review.md:15`
- `agents/packages/geolocation/review.md:15`
- `agents/packages/filesystem/review.md:15`
- `agents/packages/spritesheet-formats/review.md:8,14,18,20,22,39,40,41,42,43,44,45,46,53,63,77,82,84,85,96`
- `agents/packages/textshaper/review.md:12,15,17,19,25,27,28,29,49,51,53`
- `agents/packages/loader/review.md:12,17,29,43,47,61,65,77,79,81`
- `agents/packages/tray/review.md:13,16,18,30,45,52,54,58,60,62,71,75`
- `agents/packages/storage/review.md:10,15,25,38,49,85`
- `agents/packages/bitmap/review.md:8,9,15,17,36,48,54,58`
- `agents/packages/textshaper-canvas/review.md:9,15,23,28,43,59,66,70`
- `agents/packages/textshaper-canvas/assessment.md:9`
- `agents/packages/device/review.md:12`
- `agents/packages/shell/review.md:19`
- Read: integration bundle/delta identifier; not confidently classified as a landed Flight pin.

## 12. `b62d9808` — `feat(particleemitter): extract emitter node from sprite + particles; particles is now a pure leaf`

- `agents/packages/particles/review.md:27`
- `agents/packages/sprite/review.md:18,46`
- Read: historical package-extraction citation.

## 13. `d2fc920a` — `feat(debug): add gated timing spans and frame markers over @flighthq/log`

- `agents/packages/log/review.md:68`
- Read: historical adjacent-package implementation citation.

## 14. `d6927f58` — `refactor(ts/types): convert BlendMode enum to a const namespace + open string`

- `agents/packages/types/review.md:26`
- Read: historical types-refactor citation.

## 15. `df810bf5` — `refactor(adjustments): move color transform off the node to a generic colorAdjustments slot`

- `agents/packages/scene2d/review.md:24`
- `agents/packages/node/review.md:68`
- Read: historical cross-package implementation citation.

## 16. `eb73c3d74` — `chore(scripts): add scripts for review/conformance tests`

- `agents/packages/host-electron/review.md:7,18,75`
- `agents/packages/updater/review.md:16`
- `agents/packages/surface-rs/review.md:7,21`
- `agents/packages/scene2d-gl/assessment.md:9`
- `agents/packages/scene2d-gl/review.md:11`
- `agents/packages/texture/review.md:12,18`
- `agents/packages/text/review.md:7,14,16`
- `agents/packages/sdk/review.md:11,15,17`
- `agents/packages/storage/review.md:9,15`
- `agents/packages/tray/review.md:12,18`
- `agents/packages/textshaper-canvas/assessment.md:9`
- `agents/packages/textshaper-canvas/review.md:8,15`
- `agents/packages/textshaper/review.md:11,15,17,19`
- `agents/packages/spritesheet-formats/review.md:7,18`
- `agents/packages/loader/review.md:11,17`
- `agents/packages/bitmap/review.md:7,17,19,42`
- Read: historical `origin/main` base identifier inside merge-gate/bundle reviews; not confidently
  classified as a current Flight pin.
