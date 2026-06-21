/**
 * Edit-mode regeneration: `editDirective` + `baselineContent` thread into the
 * slide content prompt so the agent's `regenerate_scene` tool can steer a
 * whole-slide regeneration with a natural-language instruction, using the
 * current slide as the edit baseline.
 *
 * When no `editDirective` is supplied, the slide content prompt MUST be
 * unchanged (no EDIT MODE block) — a regression guard for the default
 * course-generation path.
 */
import { describe, expect, it } from 'vitest';

import { generateSceneContent } from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { SceneOutline, GeneratedSlideContent } from '@/lib/types/generation';

const INSTRUCTION = '<<EDIT-INSTRUCTION-SENTINEL>> make it concise';

function makeCapturingAiCall(response: string): { aiCall: AICallFn; lastUser: () => string } {
  let lastUser = '';
  const aiCall: AICallFn = async (_system, user) => {
    lastUser = user;
    return response;
  };
  return { aiCall, lastUser: () => lastUser };
}

function slideOutline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'scene-1',
    type: 'slide',
    title: 'Test Scene',
    description: 'A scene for testing edit-mode threading.',
    keyPoints: ['point a', 'point b'],
    order: 0,
    ...overrides,
  };
}

const BASELINE: GeneratedSlideContent = {
  elements: [
    {
      id: 'text_baseline',
      type: 'text',
      left: 0,
      top: 0,
      width: 100,
      height: 40,
      content: '<p>BASELINE-ELEMENT-SENTINEL</p>',
      defaultFontName: '',
      defaultColor: '#000',
      rotate: 0,
    },
  ],
  background: undefined,
  remark: '',
};

describe('slide content edit-mode directive', () => {
  it('threads editDirective + baselineContent into the slide content prompt', async () => {
    const { aiCall, lastUser } = makeCapturingAiCall(
      JSON.stringify({ elements: [], background: null, remark: '' }),
    );

    await generateSceneContent(slideOutline(), aiCall, {
      editDirective: INSTRUCTION,
      baselineContent: BASELINE,
    });

    expect(lastUser()).toContain('EDIT MODE');
    expect(lastUser()).toContain(INSTRUCTION);
    // The baseline slide is serialized into the prompt so content-specific
    // instructions ("drop the 2nd bullet") operate on the real slide.
    expect(lastUser()).toContain('BASELINE-ELEMENT-SENTINEL');
  });

  it('leaves the slide content prompt unchanged when no editDirective is given', async () => {
    const { aiCall, lastUser } = makeCapturingAiCall(
      JSON.stringify({ elements: [], background: null, remark: '' }),
    );

    await generateSceneContent(slideOutline(), aiCall, {});

    expect(lastUser()).not.toContain('EDIT MODE');
  });

  it('uses the baseline for a faithful re-render when no editDirective is given', async () => {
    const { aiCall, lastUser } = makeCapturingAiCall(
      JSON.stringify({ elements: [], background: null, remark: '' }),
    );

    await generateSceneContent(slideOutline(), aiCall, { baselineContent: BASELINE });

    // A baseline alone (no instruction) must still enter EDIT MODE so the model
    // re-renders the existing slide rather than generating one from scratch.
    expect(lastUser()).toContain('EDIT MODE');
    expect(lastUser()).toContain('BASELINE-ELEMENT-SENTINEL');
    expect(lastUser()).toContain('faithfully');
  });

  it('instructs the model to keep baseline images', async () => {
    const { aiCall, lastUser } = makeCapturingAiCall(
      JSON.stringify({ elements: [], background: null, remark: '' }),
    );

    const baselineWithImage: GeneratedSlideContent = {
      elements: [
        {
          id: 'img_1',
          type: 'image',
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          src: 'https://example.com/i.png',
          rotate: 0,
        } as never,
      ],
      background: undefined,
      remark: '',
    };

    await generateSceneContent(slideOutline(), aiCall, {
      editDirective: INSTRUCTION,
      baselineContent: baselineWithImage,
    });

    expect(lastUser()).toContain('KEEP them');
  });

  it('does not serialize image binary payloads into the edit prompt', async () => {
    const { aiCall, lastUser } = makeCapturingAiCall(
      JSON.stringify({ elements: [], background: null, remark: '' }),
    );

    // A real base64 data: src — the kind that resolveImageIds bakes in before
    // storage. It must NOT end up serialized into the prompt.
    const base64Payload = 'A'.repeat(2000);
    const dataSrc = `data:image/png;base64,${base64Payload}`;
    const baselineWithDataImage: GeneratedSlideContent = {
      elements: [
        {
          id: 'img_data',
          type: 'image',
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          src: dataSrc,
          rotate: 0,
        } as never,
      ],
      background: undefined,
      remark: '',
    };

    await generateSceneContent(slideOutline(), aiCall, {
      editDirective: INSTRUCTION,
      baselineContent: baselineWithDataImage,
    });

    const prompt = lastUser();
    // The base64 payload must be stripped from the serialized baseline...
    expect(prompt).not.toContain(base64Payload);
    expect(prompt).toContain('[omitted]');
    // ...but an image element is still present, so the KEEP-images rule applies.
    expect(prompt).toContain('"type":"image"');
    expect(prompt).toContain('KEEP them');
  });

  it('keeps short non-data media URLs as-is but strips data: payloads', async () => {
    const { aiCall, lastUser } = makeCapturingAiCall(
      JSON.stringify({ elements: [], background: null, remark: '' }),
    );

    const httpSrc = 'https://cdn.example.com/clip.mp4';
    const dataPoster = `data:image/png;base64,${'B'.repeat(2000)}`;
    const baseline: GeneratedSlideContent = {
      elements: [
        {
          id: 'vid_1',
          type: 'video',
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          src: httpSrc,
          poster: dataPoster,
          autoplay: false,
          rotate: 0,
        } as never,
      ],
      background: undefined,
      remark: '',
    };

    await generateSceneContent(slideOutline(), aiCall, {
      editDirective: INSTRUCTION,
      baselineContent: baseline,
    });

    const prompt = lastUser();
    // Short non-data URL kept...
    expect(prompt).toContain(httpSrc);
    // ...but the base64 poster payload stripped.
    expect(prompt).not.toContain('B'.repeat(2000));
    expect(prompt).toContain('[omitted]');
  });
});
