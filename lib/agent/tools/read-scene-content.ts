/**
 * `read_scene_content` agent tool
 *
 * Read-only. Surfaces the current scene's outline + content to the model so it
 * can reason about the slide, answer questions about it, and distil a precise
 * instruction for `regenerate_scene`. This is the "read" half of read-then-act:
 * the model SEES the slide here (instead of regenerating blind), while the
 * trusted content used for execution still flows from the injected context.
 *
 * The content is pulled from the same client-injected `SceneContext`
 * (`getSceneContext`) the other tools use — no new data plumbing, and strictly
 * more token-efficient than pre-stuffing every scene into the system prompt.
 */

import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { SceneContext } from './regenerate-scene-actions';

// ── Deps ─────────────────────────────────────────────────────────────────────

export interface ReadSceneContentDeps {
  /** Returns the trusted scene/stage context for a scene id (client-sourced). */
  getSceneContext: (sceneId: string) => SceneContext | undefined;
}

// ── Params ───────────────────────────────────────────────────────────────────
// The model only needs to say WHICH scene to read; defaults to the active one.

export const ReadSceneContentParams = Type.Object({
  sceneId: Type.Optional(
    Type.String({
      description:
        'The id of the scene to read. Defaults to the current scene shown in the system prompt.',
    }),
  ),
});

export type ReadSceneContentParams = Static<typeof ReadSceneContentParams>;

// ── Details returned to the client ───────────────────────────────────────────

export interface ReadSceneContentDetails {
  sceneId: string;
  title: string;
  type: string;
  outline: SceneContext['outline'];
  content: SceneContext['content'];
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function makeReadSceneContentTool(
  deps: ReadSceneContentDeps,
): AgentTool<typeof ReadSceneContentParams, ReadSceneContentDetails> {
  return {
    name: 'read_scene_content',
    label: 'Read scene content',
    description:
      'Reads the current scene to understand what is on it — its outline (title, ' +
      'description, key points) and its content (slide elements / quiz questions / etc). ' +
      'Use this BEFORE answering questions about the slide or regenerating it, so your ' +
      'reply and any regeneration instruction reflect what is actually on the slide. ' +
      'Only supply the sceneId — the scene data is loaded automatically.',
    parameters: ReadSceneContentParams,

    execute: async (_toolCallId, params) => {
      const sceneId = params.sceneId ?? '';
      const ctx = deps.getSceneContext(sceneId);
      if (!ctx) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: scene context not found for sceneId "${sceneId}". Cannot read the scene.`,
            },
          ],
          details: {
            sceneId,
            title: '',
            type: '',
            outline: undefined as unknown as SceneContext['outline'],
            content: undefined as unknown as SceneContext['content'],
          },
          isError: true,
        };
      }

      const { outline, content } = ctx;
      const keyPoints = (outline.keyPoints ?? []).join('; ');
      return {
        content: [
          {
            type: 'text',
            text:
              `Scene "${outline.title}" (type: ${outline.type}). ` +
              `Description: ${outline.description || '(none)'}. ` +
              `Key points: ${keyPoints || '(none)'}. ` +
              `Full content is available in the tool result for your reasoning.`,
          },
        ],
        details: {
          sceneId,
          title: outline.title,
          type: outline.type,
          outline,
          content,
        },
      };
    },
  };
}
