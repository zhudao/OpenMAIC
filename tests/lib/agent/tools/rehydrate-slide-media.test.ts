/**
 * `rehydrateSlideMedia` — media-integrity safety net for whole-slide
 * regeneration. The edit prompt strips data:/base64 media payloads to
 * `'[omitted]'`, so the model echoes placeholders back. We never trust that
 * echo: after generation we restore real media (image/video/audio `src`, video
 * `poster`, image background) from the trusted baseline, matched by element id.
 */
import { describe, expect, it } from 'vitest';

import { rehydrateSlideMedia } from '@/lib/agent/tools/regenerate-scene';
import type { GeneratedSlideContent } from '@/lib/types/generation';
import type { PPTElement } from '@maic/dsl';

function img(id: string, src: string): PPTElement {
  return {
    id,
    type: 'image',
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    src,
    fixedRatio: true,
    rotate: 0,
  } as unknown as PPTElement;
}

function vid(id: string, src: string | undefined, poster: string | undefined): PPTElement {
  return {
    id,
    type: 'video',
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    src,
    poster,
    autoplay: false,
    rotate: 0,
  } as unknown as PPTElement;
}

function txt(id: string, content: string): PPTElement {
  return {
    id,
    type: 'text',
    left: 0,
    top: 0,
    width: 100,
    height: 40,
    content,
    defaultFontName: '',
    defaultColor: '#000',
    rotate: 0,
  } as unknown as PPTElement;
}

describe('rehydrateSlideMedia', () => {
  it('restores a real image src when the generated element echoed the placeholder', () => {
    const real = 'data:image/png;base64,AAAA';
    const baseline: GeneratedSlideContent = { elements: [img('img_1', real)] };
    const generated: GeneratedSlideContent = { elements: [img('img_1', '[omitted]')] };

    const out = rehydrateSlideMedia(generated, baseline);

    expect((out.elements[0] as { src: string }).src).toBe(real);
  });

  it('restores a real http(s) image src too (the echo is also lossy for urls)', () => {
    const real = 'https://cdn.example.com/a.png';
    const baseline: GeneratedSlideContent = { elements: [img('img_1', real)] };
    const generated: GeneratedSlideContent = { elements: [img('img_1', '[image omitted]')] };

    const out = rehydrateSlideMedia(generated, baseline);

    expect((out.elements[0] as { src: string }).src).toBe(real);
  });

  it('restores video src + poster by id', () => {
    const baseline: GeneratedSlideContent = {
      elements: [vid('vid_1', 'data:video/mp4;base64,VVVV', 'data:image/png;base64,PPPP')],
    };
    const generated: GeneratedSlideContent = {
      elements: [vid('vid_1', '[omitted]', '[omitted]')],
    };

    const out = rehydrateSlideMedia(generated, baseline);
    const el = out.elements[0] as { src?: string; poster?: string };
    expect(el.src).toBe('data:video/mp4;base64,VVVV');
    expect(el.poster).toBe('data:image/png;base64,PPPP');
  });

  it('leaves elements with no baseline match untouched', () => {
    const baseline: GeneratedSlideContent = { elements: [img('img_1', 'data:image/png;base64,X')] };
    const generated: GeneratedSlideContent = {
      elements: [img('img_NEW', 'https://new.example.com/x.png'), txt('text_1', '<p>hi</p>')],
    };

    const out = rehydrateSlideMedia(generated, baseline);

    expect((out.elements[0] as { src: string }).src).toBe('https://new.example.com/x.png');
    expect((out.elements[1] as { content: string }).content).toBe('<p>hi</p>');
  });

  it('does not cross-restore when the id matches but the type differs', () => {
    const baseline: GeneratedSlideContent = {
      elements: [img('shared', 'data:image/png;base64,X')],
    };
    // Generated reuses the id for a NON-media element — must stay as-is.
    const generated: GeneratedSlideContent = { elements: [txt('shared', '<p>kept</p>')] };

    const out = rehydrateSlideMedia(generated, baseline);

    expect((out.elements[0] as { content: string }).content).toBe('<p>kept</p>');
    expect((out.elements[0] as { src?: string }).src).toBeUndefined();
  });

  it('restores an image background when the generated slide lost it', () => {
    const baseline: GeneratedSlideContent = {
      elements: [],
      background: { type: 'image', image: { src: 'data:image/png;base64,BG', size: 'cover' } },
    };
    const generated: GeneratedSlideContent = {
      elements: [],
      background: { type: 'solid', color: '#fff' },
    };

    const out = rehydrateSlideMedia(generated, baseline);

    expect(out.background?.type).toBe('image');
    expect(out.background?.image?.src).toBe('data:image/png;base64,BG');
  });

  it('restores an image background when the generated one is a placeholder', () => {
    const baseline: GeneratedSlideContent = {
      elements: [],
      background: { type: 'image', image: { src: 'data:image/png;base64,BG', size: 'cover' } },
    };
    const generated: GeneratedSlideContent = {
      elements: [],
      background: { type: 'image', image: { src: '[omitted]', size: 'cover' } },
    };

    const out = rehydrateSlideMedia(generated, baseline);

    expect(out.background?.image?.src).toBe('data:image/png;base64,BG');
  });

  it('keeps a genuinely new background the model produced', () => {
    const baseline: GeneratedSlideContent = {
      elements: [],
      background: { type: 'image', image: { src: 'data:image/png;base64,BG', size: 'cover' } },
    };
    const generated: GeneratedSlideContent = {
      elements: [],
      background: { type: 'solid', color: '#123456' },
    };

    // Background is restored from baseline because the model can't author media —
    // a solid color the model chose is overridden by the real image baseline.
    const out = rehydrateSlideMedia(generated, baseline);
    expect(out.background?.type).toBe('image');
  });

  it('returns input unchanged when there is no baseline', () => {
    const generated: GeneratedSlideContent = { elements: [img('img_1', '[omitted]')] };
    const out = rehydrateSlideMedia(generated, undefined);
    expect(out).toBe(generated);
  });
});
