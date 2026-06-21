import { describe, expect, it, vi } from 'vitest';

import { makeRegenerateSceneTool } from '@/lib/agent/tools/regenerate-scene';
import type { SceneContext } from '@/lib/agent/tools/regenerate-scene-actions';
import type { SceneOutline } from '@/lib/types/generation';
import type { SceneContent } from '@/lib/types/stage';

function slideOutline(id: string): SceneOutline {
  return { id, type: 'slide', title: 'Slide Title', description: 'd', keyPoints: ['a'], order: 0 };
}

function slideContent(): SceneContent {
  return {
    type: 'slide',
    canvas: {
      id: 'cv',
      viewportSize: 1000,
      viewportRatio: 0.5625,
      elements: [
        {
          id: 'text_old',
          type: 'text',
          left: 0,
          top: 0,
          width: 100,
          height: 40,
          content: '<p>OLD-BASELINE-SENTINEL</p>',
          defaultFontName: '',
          defaultColor: '#000',
          rotate: 0,
        },
      ],
    },
  } as unknown as SceneContent;
}

function slideCtx(id: string): SceneContext {
  return {
    outline: slideOutline(id),
    allOutlines: [slideOutline(id)],
    content: slideContent(),
    stageId: 'stage-1',
  };
}

const NEW_SLIDE_JSON = JSON.stringify({
  elements: [
    {
      id: 'text_new',
      type: 'text',
      left: 0,
      top: 0,
      width: 100,
      height: 40,
      content: '<p>NEW-CONTENT</p>',
      defaultFontName: '',
      defaultColor: '#000',
    },
  ],
  background: null,
  remark: '',
});

describe('regenerate_scene tool', () => {
  it('regenerates slide content (with the instruction + baseline) then actions', async () => {
    const prompts: string[] = [];
    const aiCall = vi.fn(async (_system: string, user: string) => {
      prompts.push(user);
      // 1st call = content generation (expects slide JSON); 2nd = actions (array)
      return prompts.length === 1 ? NEW_SLIDE_JSON : '[]';
    });

    const tool = makeRegenerateSceneTool({
      aiCall,
      getSceneContext: (id) => (id === 's1' ? slideCtx('s1') : undefined),
    });

    const res = await tool.execute('call-1', {
      sceneId: 's1',
      instruction: '<<REGEN-INSTRUCTION-SENTINEL>>',
    });

    expect(res.isError).toBeFalsy();
    expect(res.details.sceneId).toBe('s1');
    // The content-generation prompt ran in EDIT MODE with the instruction + baseline.
    expect(prompts[0]).toContain('EDIT MODE');
    expect(prompts[0]).toContain('<<REGEN-INSTRUCTION-SENTINEL>>');
    expect(prompts[0]).toContain('OLD-BASELINE-SENTINEL');
    // The regenerated content is returned for the client to apply.
    expect(JSON.stringify(res.details.content)).toContain('NEW-CONTENT');
  });

  it('refuses non-slide scenes without generating anything', async () => {
    const aiCall = vi.fn(async () => NEW_SLIDE_JSON);
    const quizCtx: SceneContext = {
      outline: { id: 'q1', type: 'quiz', title: 'Quiz', description: '', keyPoints: [], order: 0 },
      allOutlines: [],
      content: { type: 'quiz', questions: [] } as unknown as SceneContent,
      stageId: 'stage-1',
    };
    const tool = makeRegenerateSceneTool({ aiCall, getSceneContext: () => quizCtx });

    const res = await tool.execute('call-1', { sceneId: 'q1' });

    expect(res.isError).toBe(true);
    expect(aiCall).not.toHaveBeenCalled();
  });

  it('errors when the scene context is missing', async () => {
    const aiCall = vi.fn(async () => NEW_SLIDE_JSON);
    const tool = makeRegenerateSceneTool({ aiCall, getSceneContext: () => undefined });
    const res = await tool.execute('call-1', { sceneId: 'nope' });
    expect(res.isError).toBe(true);
    expect(aiCall).not.toHaveBeenCalled();
  });
});
