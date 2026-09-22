import type {
  ImportDiagnostic,
  Node2D,
  SwfTagFamily,
  SwfTagFamilyInstantiation,
  SwfTagFamilyResources,
  SwfTagHandler,
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagReader,
  SwfTagRectangle,
  SwfTagTimelineState,
  SwfTimeline,
} from '@flighthq/types/contract';

export function composeSwfTagHandlers(handlers: readonly SwfTagHandler[]): SwfTagFamily {
  const tagToHandler = new Map<number, SwfTagHandler>();
  const tags: number[] = [];
  for (const handler of handlers) {
    for (const tag of handler.tags) {
      tagToHandler.set(tag, handler);
      tags.push(tag);
    }
  }

  const handlersWithResolve = handlers.filter((h) => h.resolve !== undefined);
  const handlersWithFinishTimeline = handlers.filter((h) => h.finishTimeline !== undefined);
  const handlersWithInstantiate = handlers.filter((h) => h.instantiate !== undefined);

  return {
    tags,
    parse(
      body: SwfTagReader,
      tag: number,
      state: SwfTagParseState,
      timeline: SwfTagTimelineState,
      diagnostics: ImportDiagnostic[] | undefined,
    ): boolean {
      const handler = tagToHandler.get(tag);
      return handler !== undefined ? handler.parse(body, tag, state, timeline, diagnostics) : true;
    },
    ...(handlersWithResolve.length > 0
      ? {
          resolve(state: SwfTagParseState, timeline: SwfTimeline): void {
            for (const handler of handlersWithResolve) handler.resolve!(state, timeline);
          },
        }
      : undefined),
    ...(handlersWithFinishTimeline.length > 0
      ? {
          finishTimeline(state: SwfTagParseState, timeline: SwfTagTimelineState): void {
            for (const handler of handlersWithFinishTimeline) handler.finishTimeline!(state, timeline);
          },
        }
      : undefined),
    ...(handlersWithInstantiate.length > 0
      ? { instantiate: composeInstantiations(handlersWithInstantiate.map((h) => h.instantiate!)) }
      : undefined),
  };
}

function composeInstantiations(instantiations: readonly SwfTagFamilyInstantiation[]): SwfTagFamilyInstantiation {
  const withCreateResources = instantiations.filter((i) => i.createResources !== undefined);
  const withCreatePlacementNode = instantiations.filter((i) => i.createPlacementNode !== undefined);
  const withHasPlacementContent = instantiations.filter((i) => i.hasPlacementContent !== undefined);

  return {
    ...(withCreateResources.length > 0
      ? {
          createResources(parsed: Readonly<SwfTagParseResult>, resources: SwfTagFamilyResources): void {
            for (const inst of withCreateResources) inst.createResources!(parsed, resources);
          },
        }
      : undefined),
    ...(withCreatePlacementNode.length > 0
      ? {
          createPlacementNode(
            parsed: Readonly<SwfTagParseResult>,
            characterId: number,
            bounds: Readonly<SwfTagRectangle> | null,
            diagnostics: ImportDiagnostic[] | undefined,
          ): Node2D | null {
            for (const inst of withCreatePlacementNode) {
              const node = inst.createPlacementNode!(parsed, characterId, bounds, diagnostics);
              if (node !== null) return node;
            }
            return null;
          },
        }
      : undefined),
    ...(withHasPlacementContent.length > 0
      ? {
          hasPlacementContent(parsed: Readonly<SwfTagParseResult>, characterId: number): boolean {
            for (const inst of withHasPlacementContent) {
              if (inst.hasPlacementContent!(parsed, characterId)) return true;
            }
            return false;
          },
        }
      : undefined),
  };
}
