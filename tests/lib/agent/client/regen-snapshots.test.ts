import { describe, expect, it, beforeEach, vi } from 'vitest';

import { useRegenSnapshots } from '@/lib/agent/client/regen-snapshots';
import type { SceneContent } from '@/lib/types/stage';

const SNAP = {
  sceneId: 's1',
  content: { type: 'slide', canvas: { id: 'c', elements: [] } } as unknown as SceneContent,
  actions: [{ type: 'speech', id: 'a_old' } as never],
};

describe('regen-snapshots store', () => {
  beforeEach(() => {
    useRegenSnapshots.setState({ snapshots: {} });
  });

  it('stores a snapshot keyed by toolCallId (not yet restored)', () => {
    useRegenSnapshots.getState().setSnapshot('call-1', SNAP);
    const s = useRegenSnapshots.getState().snapshots['call-1'];
    expect(s.sceneId).toBe('s1');
    expect(s.restored).toBe(false);
  });

  it('restore re-applies the snapshot once and marks it restored', () => {
    const apply = vi.fn();
    useRegenSnapshots.getState().setSnapshot('call-1', SNAP);

    useRegenSnapshots.getState().restore('call-1', apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('s1', { content: SNAP.content, actions: SNAP.actions });
    expect(useRegenSnapshots.getState().snapshots['call-1'].restored).toBe(true);

    // Second restore is a no-op.
    useRegenSnapshots.getState().restore('call-1', apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('restore is a no-op for an unknown toolCallId', () => {
    const apply = vi.fn();
    useRegenSnapshots.getState().restore('missing', apply);
    expect(apply).not.toHaveBeenCalled();
  });
});
