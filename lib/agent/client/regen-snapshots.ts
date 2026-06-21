'use client';

/**
 * Snapshot store for `regenerate_scene` "restore previous" support.
 *
 * Whole-slide regeneration applies directly to the canvas (snappy), but it
 * overwrites whatever the user had — including hand-edits. Before applying, the
 * runtime snapshots the pre-regenerate scene here, keyed by toolCallId, so the
 * tool card can offer a "还原到重生成前 / Restore previous" button that does not
 * rely on the user remembering Ctrl+Z.
 */
import { create } from 'zustand';
import type { Action } from '@/lib/types/action';
import type { SceneContent } from '@/lib/types/stage';

export interface RegenSnapshot {
  sceneId: string;
  content: SceneContent;
  actions: Action[];
  restored: boolean;
}

/** Re-applies the snapshot to the stage store (injected so the store stays testable). */
export type RestoreApplyFn = (
  sceneId: string,
  patch: { content: SceneContent; actions: Action[] },
) => void;

interface RegenSnapshotsState {
  snapshots: Record<string, RegenSnapshot>;
  setSnapshot: (toolCallId: string, snap: Omit<RegenSnapshot, 'restored'>) => void;
  restore: (toolCallId: string, apply: RestoreApplyFn) => void;
}

export const useRegenSnapshots = create<RegenSnapshotsState>((set, get) => ({
  snapshots: {},
  setSnapshot: (toolCallId, snap) =>
    set((s) => ({
      snapshots: { ...s.snapshots, [toolCallId]: { ...snap, restored: false } },
    })),
  restore: (toolCallId, apply) => {
    const snap = get().snapshots[toolCallId];
    if (!snap || snap.restored) return;
    apply(snap.sceneId, { content: snap.content, actions: snap.actions });
    set((s) => ({
      snapshots: { ...s.snapshots, [toolCallId]: { ...snap, restored: true } },
    }));
  },
}));
