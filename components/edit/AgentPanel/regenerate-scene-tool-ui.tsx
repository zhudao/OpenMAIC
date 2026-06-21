'use client';

/**
 * Tool-call UI for `regenerate_scene` (whole-slide regeneration). Mirrors the
 * `regenerate_scene_actions` card (`.ae-tool` language), but the body reports
 * the regenerated slide (element count) + the instruction, and it carries a
 * "还原到重生成前 / Restore previous" button: whole-slide regeneration applies
 * directly to the canvas, so the card offers an explicit one-click revert to
 * the snapshot taken before this regeneration (no Ctrl+Z required).
 */
import { AlertCircle, AtSign, Check, ChevronDown, Loader2, Undo2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { makeAssistantToolUI } from '@assistant-ui/react';
import { cn } from '@/lib/utils/cn';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store/stage';
import { useRegenSnapshots } from '@/lib/agent/client/regen-snapshots';
import { applyScenePatchInSync } from '@/lib/agent/client/apply-slide-content';

interface RegenerateSceneResult {
  content?: { type: string; text?: string }[];
  details?: { sceneId?: string; content?: { elements?: unknown[] } | null; actions?: unknown[] };
}

function ScenePill({ sceneId }: { sceneId?: string }) {
  const title = useStageStore((s) =>
    sceneId ? (s.scenes.find((x) => x.id === sceneId)?.title ?? null) : null,
  );
  if (!title) return null;
  return (
    <span className="inline-flex min-w-0 max-w-[50%] shrink-0 items-center gap-0.5 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-medium text-[#5b1fa8] dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
      <AtSign className="size-2.5 shrink-0 text-violet-500" />
      <span className="truncate">{title}</span>
    </span>
  );
}

function RestoreButton({ toolCallId }: { toolCallId: string }) {
  const { t } = useI18n();
  const snap = useRegenSnapshots((s) => s.snapshots[toolCallId]);
  if (!snap) return null;
  if (snap.restored) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Undo2 className="size-3" />
        {t('edit.regenScene.restored')}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() =>
        useRegenSnapshots
          .getState()
          .restore(toolCallId, (id, patch) => applyScenePatchInSync(id, patch))
      }
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
    >
      <Undo2 className="size-3" />
      {t('edit.regenScene.restore')}
    </button>
  );
}

function ToolRow({
  running,
  failed,
  result,
  sceneId,
  instruction,
  toolCallId,
}: {
  running: boolean;
  failed: boolean;
  result?: RegenerateSceneResult;
  sceneId?: string;
  instruction?: string;
  toolCallId: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const elementCount = result?.details?.content?.elements?.length ?? 0;
  const failText = result?.content?.[0]?.text;
  const expandable = !running && (elementCount > 0 || !!failText || !!result?.details?.sceneId);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[9px] border',
        running ? 'border-violet-300 dark:border-violet-500/40' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 bg-muted/50 px-2.5 py-2 text-left',
          expandable ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 shrink truncate text-[12.5px] font-semibold text-foreground">
          {t('edit.regenScene.title')}
        </span>
        <ScenePill sceneId={sceneId} />

        {running ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10.5px] font-semibold text-[#5b1fa8] dark:bg-violet-500/10 dark:text-violet-300">
            <Loader2 className="size-3 animate-spin" />
            {t('edit.regenScene.generating')}
          </span>
        ) : failed ? (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            <AlertCircle className="size-3" />
            {t('edit.regenScene.notGenerated')}
          </span>
        ) : (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            <Check className="size-3" />
            {t('edit.regenScene.updated')}
          </span>
        )}

        {expandable && (
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-neutral-400 transition-transform',
              open && 'rotate-180',
            )}
          />
        )}
      </button>

      {open && expandable && (
        <div className="space-y-2 border-t border-border px-2.5 py-2 text-[11px] text-muted-foreground">
          {failed && failText ? (
            <p className="text-amber-600 dark:text-amber-500">{failText}</p>
          ) : null}
          {instruction ? <p className="italic">“{instruction}”</p> : null}
          {elementCount > 0 && (
            <p className="font-mono">
              {t('edit.regenScene.elementsCount', { count: elementCount })}
            </p>
          )}
          {!failed && <RestoreButton toolCallId={toolCallId} />}
        </div>
      )}
    </div>
  );
}

export const RegenerateSceneUI = makeAssistantToolUI<
  { sceneId?: string; instruction?: string },
  RegenerateSceneResult
>({
  toolName: 'regenerate_scene',
  render: ({ args, status, result, isError, toolCallId }) => {
    const running = status.type === 'running' || status.type === 'requires-action';
    // pi-agent-core 0.78.0 does NOT propagate a tool result's `isError` into
    // `tool_execution_end.isError`, so refusals / generation-failures (which
    // return `details.content === null`, i.e. nothing was applied) would render
    // as a green "Updated" badge. Derive failure from the result too: if the run
    // finished but produced no content, treat it as failed.
    const noContentApplied = !running && result != null && result.details?.content == null;
    const failed = !running && (isError || status.type === 'incomplete' || noContentApplied);
    const sceneId = args?.sceneId ?? result?.details?.sceneId;
    return (
      <ToolRow
        running={running}
        failed={failed}
        result={result}
        sceneId={sceneId}
        instruction={args?.instruction}
        toolCallId={toolCallId}
      />
    );
  },
});
