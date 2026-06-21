/**
 * `regenerate_scene` agent tool
 *
 * Regenerates a whole SLIDE — its content (elements/layout/text) AND its
 * playback actions (narration/cues) — to match a natural-language instruction.
 * Mirrors `generateSingleScene`'s two steps directly:
 *   generateSceneContent (EDIT MODE) → generateSceneActions
 * (NOT `generateFullScenes`, which writes into a StageStore).
 *
 * Trust boundary (carries the v0 rule): the model supplies only `sceneId` +
 * `instruction`. The slide's current content/outline come from the trusted
 * client-injected `SceneContext` (`getSceneContext`) and are fed as the edit
 * baseline — the model never authors content.
 *
 * slide-only this release: non-slide scenes get a typed refusal and nothing is
 * generated.
 *
 * Returns `{ sceneId, content, actions }` in `details`; the client reads
 * `tool_execution_end`, snapshots the pre-state, and applies content+actions.
 */

import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { generateSceneContent, generateSceneActions } from '@/lib/generation/scene-generator';
import type { SceneGenerationContext } from '@/lib/generation/generation-pipeline';
import type { Action } from '@/lib/types/action';
import type { GeneratedSlideContent } from '@/lib/types/generation';
import type { SceneContent } from '@/lib/types/stage';
import type { RegenerateActionsDeps, SceneContext } from './regenerate-scene-actions';

// ── Runtime SlideContent → generation GeneratedSlideContent (edit baseline) ──
// The client sends runtime `SceneContent` ({ type:'slide', canvas: Slide }); the
// generator's edit baseline wants the generation shape ({ elements, background }).
function slideBaseline(content: SceneContent): GeneratedSlideContent | undefined {
  if (content.type !== 'slide') return undefined;
  return {
    elements: content.canvas.elements ?? [],
    background: content.canvas.background,
  } satisfies GeneratedSlideContent;
}

// ── Params (trust boundary: only id + instruction; content comes from deps) ──

export const RegenerateSceneParams = Type.Object({
  sceneId: Type.String({
    description:
      'The id of the slide to regenerate. Use the id of the current scene shown in the system prompt.',
  }),
  instruction: Type.Optional(
    Type.String({
      description:
        "The user's instruction for how to change the slide, in natural language " +
        '(e.g. "condense to 3 bullet points", "add a real-world example", "make the title punchier"). ' +
        'Do NOT include slide content here — the current slide is loaded automatically as the baseline.',
    }),
  ),
});

export type RegenerateSceneParams = Static<typeof RegenerateSceneParams>;

// ── Details returned to the client ───────────────────────────────────────────

export interface RegenerateSceneDetails {
  sceneId: string;
  content: GeneratedSlideContent | null;
  actions: Action[];
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function makeRegenerateSceneTool(
  deps: RegenerateActionsDeps,
): AgentTool<typeof RegenerateSceneParams, RegenerateSceneDetails> {
  return {
    name: 'regenerate_scene',
    label: 'Regenerate slide',
    description:
      'Regenerates a whole slide — its content AND its narration — to match the user instruction. ' +
      'Only works on slide scenes. Supply the sceneId and a natural-language instruction; ' +
      'the current slide is loaded automatically as the editing baseline.',
    parameters: RegenerateSceneParams,

    execute: async (_toolCallId, params) => {
      const { sceneId, instruction } = params;

      const ctxData: SceneContext | undefined = deps.getSceneContext(sceneId);
      if (!ctxData) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: scene context not found for sceneId "${sceneId}". Cannot regenerate the slide.`,
            },
          ],
          details: { sceneId, content: null, actions: [] },
          isError: true,
        };
      }

      const { outline, allOutlines, content, stageId, agents, languageDirective } = ctxData;
      void stageId;

      // slide-only this release — refuse non-slide outlines AND any scene whose
      // injected content isn't a slide (guards against scene-type desync between
      // the outline and the actual content payload).
      if (outline.type !== 'slide' || content.type !== 'slide') {
        return {
          content: [
            {
              type: 'text',
              text:
                `Cannot regenerate this scene: regenerating the whole scene is only supported ` +
                `for slides yet (this scene is not a slide). Suggest the user edits it on the canvas.`,
            },
          ],
          details: { sceneId, content: null, actions: [] },
          isError: true,
        };
      }

      const aiCallFn = (
        systemPrompt: string,
        userPrompt: string,
        _images?: Array<{ id: string; src: string }>,
      ): Promise<string> => deps.aiCall(systemPrompt, userPrompt);

      // ── Step 1: regenerate slide content in EDIT MODE ──────────────────────
      const baselineContent = slideBaseline(content);
      const newContent = await generateSceneContent(outline, aiCallFn, {
        agents,
        languageDirective,
        editDirective: instruction,
        baselineContent,
      });

      if (!newContent || !('elements' in newContent)) {
        return {
          content: [
            {
              type: 'text',
              text:
                `Warning: slide content generation failed for "${outline.title}". ` +
                `The slide has NOT been changed.`,
            },
          ],
          details: { sceneId, content: null, actions: [] },
          isError: true,
        };
      }

      // ── Step 2: regenerate actions to match the new content ────────────────
      const allTitles = allOutlines.map((o) => o.title);
      const pageIndex = allOutlines.findIndex((o) => o.id === outline.id);
      const ctx: SceneGenerationContext = {
        pageIndex: (pageIndex >= 0 ? pageIndex : 0) + 1,
        totalPages: allOutlines.length,
        allTitles,
        previousSpeeches: [],
      };

      const actions = await generateSceneActions(outline, newContent, aiCallFn, {
        ctx,
        agents,
        languageDirective,
      });

      const text =
        actions.length > 0
          ? `Regenerated the slide content (${newContent.elements.length} elements) and ${actions.length} actions.`
          : `Regenerated the slide content (${newContent.elements.length} elements), but narration regeneration produced no actions — the existing narration is unchanged and may not match the new content.`;

      return {
        content: [{ type: 'text', text }],
        details: { sceneId, content: newContent, actions },
      };
    },
  };
}
