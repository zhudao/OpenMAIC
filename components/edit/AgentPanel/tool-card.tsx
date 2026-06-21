'use client';

/**
 * Shared tool-call card for the AgentBar, in the AgentSidebar design board's
 * `.ae-tool` language: a bordered row with a leading glyph, truncating title, an
 * optional `@scene` pill, an optional inline bar-action (always visible on the
 * row — e.g. a Restore button), a right-aligned status badge (running = violet
 * spinner, done = emerald check, failed = amber alert), and an optional
 * expandable body. Every tool card (regenerate / read / future) renders through
 * this shell so they stay visually uniform.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import { AtSign, ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useStageStore } from '@/lib/store/stage';

export type ToolStatus = 'running' | 'done' | 'failed';

/**
 * The page (scene) a tool acted on, shown as an `@title` chip — the chat is a
 * single global thread (Cursor-style), so each tool card carries its own scene
 * reference instead of splitting history per page.
 */
export function ScenePill({ sceneId }: { sceneId?: string }) {
  const title = useStageStore((s) =>
    sceneId ? (s.scenes.find((x) => x.id === sceneId)?.title ?? null) : null,
  );
  if (!title) return null;
  return (
    <span className="inline-flex min-w-0 max-w-[45%] shrink-0 items-center gap-0.5 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-medium text-[#5b1fa8] dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
      <AtSign className="size-2.5 shrink-0 text-violet-500" />
      <span className="truncate">{title}</span>
    </span>
  );
}

const BADGE_TONE: Record<ToolStatus, string> = {
  running: 'bg-violet-50 text-[#5b1fa8] dark:bg-violet-500/10 dark:text-violet-300',
  done: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  failed: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
};

export function ToolCard({
  title,
  icon: Icon,
  sceneId,
  status,
  statusIcon: StatusIcon,
  statusLabel,
  barAction,
  children,
}: {
  title: string;
  icon: LucideIcon;
  sceneId?: string;
  status: ToolStatus;
  statusIcon: LucideIcon;
  statusLabel: string;
  /** Inline action rendered on the always-visible row (e.g. Restore). */
  barAction?: ReactNode;
  /** Expandable body; when present a chevron toggles it open. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const running = status === 'running';
  const expandable = !running && Boolean(children);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[9px] border',
        running ? 'border-violet-300 dark:border-violet-500/40' : 'border-border',
      )}
    >
      {/* Row is a div (not a button) so the inline barAction can be a real,
          independently-clickable button without invalid nested-button markup. */}
      <div
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        onClick={() => expandable && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (expandable && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={cn(
          'flex w-full items-center gap-2 bg-muted/50 px-2.5 py-2 text-left',
          expandable ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        {/* Title yields first (truncates) so the @scene pill stays readable on a
            narrow rail; the pill is capped + truncates rather than collapsing. */}
        <span className="min-w-0 shrink truncate text-[12.5px] font-semibold text-foreground">
          {title}
        </span>
        <ScenePill sceneId={sceneId} />

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {barAction ? <span onClick={(e) => e.stopPropagation()}>{barAction}</span> : null}
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold',
              BADGE_TONE[status],
            )}
          >
            <StatusIcon className={cn('size-3', running && 'animate-spin')} />
            {statusLabel}
          </span>
          {expandable && (
            <ChevronDown
              className={cn('size-3.5 text-neutral-400 transition-transform', open && 'rotate-180')}
            />
          )}
        </span>
      </div>

      {open && expandable && (
        <div className="space-y-2 border-t border-border px-2.5 py-2 text-[11px] text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}
