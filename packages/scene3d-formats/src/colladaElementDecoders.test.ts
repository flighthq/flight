import {
  COLLADA_ANALYZED_FEATURES,
  COLLADA_ELEMENT_DECODERS,
  findColladaElementDecoders,
  getColladaDecoderFeatures,
} from './colladaElementDecoders.ts';
import { COLLADA_FEATURE_ELEMENTS } from './colladaFeatures.ts';
import { appendColladaMaterials } from './colladaMaterial.ts';
import { decodeColladaAnimations, decodeColladaControllers } from './colladaParse.ts';

describe('COLLADA_ELEMENT_DECODERS', () => {
  // ★ THE JOIN THAT MUST NOT DRIFT. The analyzer says what a document needs; this family says what the
  // package can decode. A feature analyzed with no decoder is an inventory entry nothing can ever
  // satisfy — a warning on every build of that content — and a decoder for a feature nothing analyzes is
  // weight no document asks for. Compared in both directions rather than asserted against a hand-list,
  // so neither side can be edited alone.
  it('covers exactly the features the analyzer reports, in both directions', () => {
    expect(getColladaDecoderFeatures()).toEqual(COLLADA_ANALYZED_FEATURES);
    expect(COLLADA_ANALYZED_FEATURES).toEqual([...COLLADA_FEATURE_ELEMENTS.keys()].sort());
  });

  it('claims exactly the elements the analyzer keys each feature on', () => {
    for (const decoder of COLLADA_ELEMENT_DECODERS) {
      expect([...decoder.elements].sort(), decoder.feature).toEqual(
        [...(COLLADA_FEATURE_ELEMENTS.get(decoder.feature) ?? [])].sort(),
      );
    }
  });

  it('gives each feature exactly one descriptor', () => {
    const features = COLLADA_ELEMENT_DECODERS.map((decoder) => decoder.feature);
    expect(features.length).toBe(new Set(features).size);
  });

  it('finds the decoder claiming an element, and none for an element nothing claims', () => {
    expect(findColladaElementDecoders('geometry').map((d) => d.feature)).toEqual(['Geometry']);
    expect(findColladaElementDecoders('effect').map((d) => d.feature)).toEqual(['Material']);
    expect(findColladaElementDecoders('library_geometries')).toEqual([]);
  });

  // `entryPoint: null` is a claim about the package's surface, so it has to be true. A descriptor naming
  // an entry point that is not exported would read as a reachable seam and fail only when someone tried.
  //
  // Checked against STATICALLY imported symbols rather than a dynamic import of the package barrel. The
  // barrel version passed alone and failed inside the full suite — importing `./contract.ts` from a test
  // pulls the whole package graph and is order-sensitive — and a guard that only holds when run in
  // isolation is worse than none, because the suite reports it green.
  it('names an entry point only where the package actually exports one', () => {
    const exported: Readonly<Record<string, unknown>> = {
      appendColladaMaterials,
      decodeColladaAnimations,
      decodeColladaControllers,
    };
    for (const decoder of COLLADA_ELEMENT_DECODERS) {
      if (decoder.entryPoint === null) continue;
      expect(exported[decoder.entryPoint], `${decoder.feature} names ${decoder.entryPoint}`).toBeDefined();
    }
  });

  // Recorded as a fact rather than a goal: three decoders are internal to `parseCollada` today, and that
  // is what a future registrable seam would have to extract first. Asserted so the count cannot quietly
  // grow — a new internal decoder should be a deliberate decision, not a drift.
  it('records which decoders are still internal to parseCollada', () => {
    const internal = COLLADA_ELEMENT_DECODERS.filter((decoder) => decoder.entryPoint === null).map((d) => d.feature);
    expect(internal.sort()).toEqual(['Camera', 'Geometry', 'Light']);
  });

  // Nothing here registers itself: the family is data a caller reads, and importing it must not wire
  // anything into a parse. Declared as a property of the module rather than left implicit.
  it('exposes only plain data, so importing it registers nothing', () => {
    for (const decoder of COLLADA_ELEMENT_DECODERS) {
      expect(typeof decoder.feature).toBe('string');
      expect(Array.isArray(decoder.elements)).toBe(true);
      expect(decoder.entryPoint === null || typeof decoder.entryPoint === 'string').toBe(true);
    }
  });
});
