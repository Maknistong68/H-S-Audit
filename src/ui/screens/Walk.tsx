import { useLocation } from 'preact-iso';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sessionStore } from '../../auth/session';
import { allItems, itemById } from '../../data/checklist';
import type { MediaRow, Tag } from '../../db/db';
import { flushPendingWrites } from '../../db/flush';
import { ownerKey } from '../../db/ids';
import { repo } from '../../db/repo';
import { snapshotIfDirty, startSnapshotTimer } from '../../db/snapshots';
import { sentenceCase } from '../../domain/text';
import type { ChecklistItem, Result } from '../../domain/types';
import { canEdit } from '../../sync/writer';
import { Banner } from '../components/Banner';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/icons';
import { ItemCard } from '../components/ItemCard';
import { ItemMediaTools } from '../components/ItemMedia';
import { JumpSheet } from '../components/JumpSheet';
import { MediaStrip } from '../components/MediaStrip';
import { ModeSwitch } from '../components/ModeSwitch';
import { Presence } from '../components/Presence';
import type { NoteFieldHandle } from '../components/NoteField';
import { ProgressLine } from '../components/ProgressLine';
import { TopBar } from '../components/TopBar';
import { useAudit } from '../hooks/useAudit';
import { useAuditChannel } from '../hooks/useAuditChannel';
import { useKeyboardShortcuts, type WalkShortcuts } from '../hooks/useKeyboardShortcuts';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { DESK_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useStore } from '../hooks/useStore';
import { paths } from '../paths';
import { adjacentItem, DEFAULT_WALK_STATE, nextIncomplete, nextUnanswered, tagCounts, visibleRows, type WalkRow, type WalkState } from '../walk/walkState';

const EXPORT_NUDGE_MS = 2 * 60 * 60 * 1000;
const TOTAL = allItems().length;
const AUTO_ADVANCE_MS = 350;

interface Group {
  key: string;
  letter?: string;
  title?: string;
  rows: WalkRow[];
}

/** Section rows become panels; subsection and item rows live inside them. */
function groupRows(rows: WalkRow[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    if (row.kind === 'section') {
      groups.push({ key: row.id, letter: row.id, title: sentenceCase(row.title ?? ''), rows: [] });
    } else {
      if (groups.length === 0) groups.push({ key: 'all', rows: [] });
      groups[groups.length - 1].rows.push(row);
    }
  }
  return groups;
}

function scrollToItem(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`item-${id}`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  });
}

export function Walk({ id }: { id: string }) {
  const { route } = useLocation();
  const desk = useMediaQuery(DESK_QUERY);
  const view = useAudit(id);
  const tagsByItem = useLiveQuery(() => repo.listItemTags(), []);
  const tags = useLiveQuery<Tag[]>(() => repo.listTags(), []);
  const media = useLiveQuery<MediaRow[]>(() => repo.listMediaMeta(id), [id]);
  const members = useLiveQuery(() => repo.listMembers(), []);
  const lang = useLiveQuery(() => repo.getSetting('dictationLang', 'en-US'), []) ?? 'en-US';
  const session = useStore(sessionStore);
  const me = session.status === 'ready' ? session.me : null;
  const readOnly = !canEdit(me?.role);
  const [state, setState] = useState<WalkState | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [interim, setInterim] = useState('');
  const noteHandle = useRef<NoteFieldHandle | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const head = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void repo.getSetting<Partial<WalkState>>(`walk:${id}`, {}).then((saved) => {
      if (!cancelled) setState({ ...DEFAULT_WALK_STATE, ...saved });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const stop = startSnapshotTimer(id);
    return () => {
      stop();
      void snapshotIfDirty(id, 'navigation').catch((err) => console.error(err));
    };
  }, [id]);

  // Section headers stick just under the sticky head, whatever its current height.
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--walk-head-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--walk-head-h');
    };
  }, []);

  const update = useCallback(
    (patch: Partial<WalkState>) => {
      setState((s) => {
        const next = { ...(s ?? DEFAULT_WALK_STATE), ...patch };
        void repo.setSetting(`walk:${id}`, next);
        return next;
      });
    },
    [id],
  );

  const mediaByOwner = useMemo(() => {
    const map = new Map<string, MediaRow[]>();
    for (const m of media ?? []) {
      const key = ownerKey(m.owner);
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return map;
  }, [media]);

  const answers = view?.answers ?? new Map();
  const rows = useMemo(() => (state && tagsByItem ? visibleRows(state, answers, tagsByItem) : []), [state, answers, tagsByItem]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const counts = useMemo(() => (tagsByItem ? tagCounts(tagsByItem, answers) : new Map()), [tagsByItem, answers]);

  const answered = [...answers.values()].filter((a) => a.result !== undefined).length;
  const flagged = [...answers.values()].filter((a) => a.flagged).length;

  const expandedId = state?.expandedId ?? null;
  const { others, deletedBy } = useAuditChannel(id, expandedId);
  const hereByItem = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of others) if (p.itemId && !map.has(p.itemId)) map.set(p.itemId, p.name);
    return map;
  }, [others]);
  const nameOf = (userId?: string): string => {
    if (!userId) return 'Someone';
    if (userId === me?.id) return 'you';
    const m = members?.find((x) => x.id === userId);
    return m?.fullName || m?.email || 'Someone';
  };
  const expandedVisible = expandedId !== null && rows.some((r) => r.kind === 'item' && r.id === expandedId);
  const expandedItem = expandedVisible ? itemById(expandedId!) : undefined;

  const expand = useCallback(
    (itemId: string | null) => {
      update({ expandedId: itemId });
      if (itemId) scrollToItem(itemId);
    },
    [update],
  );

  const shortcuts = useMemo<WalkShortcuts>(
    () => ({
      onResult: (r) => {
        if (expandedItem) void repo.setResult(id, expandedItem.id, r);
      },
      onNext: () => expand(adjacentItem(expandedId, rows, 1) ?? expandedId),
      onPrev: () => expand(adjacentItem(expandedId, rows, -1) ?? expandedId),
      onFlag: () => {
        if (expandedItem) void repo.setFlag(id, expandedItem.id, !answers.get(expandedItem.id)?.flagged);
      },
    }),
    [id, expandedItem, expandedId, rows, answers, expand],
  );
  useKeyboardShortcuts(shortcuts, state !== null);

  const setMode = (mode: WalkState['mode']) => {
    update({ mode });
    if (expandedId) scrollToItem(expandedId);
    if (mode === 'search') requestAnimationFrame(() => searchBox.current?.focus());
  };

  const audit = view?.audit;
  const needsBackup = audit !== undefined && answered > 0 && audit.updatedAt - (audit.lastExportAt ?? audit.createdAt) > EXPORT_NUDGE_MS;

  if (view && !audit) {
    return (
      <>
        <TopBar title="Walk" back={paths.home()} />
        <main class="screen">
          <p class="empty">
            This audit no longer exists. <a href={paths.home()}>Back to audits</a>
          </p>
        </main>
      </>
    );
  }

  if (view?.audit?.deletedAt !== undefined || deletedBy) {
    return (
      <>
        <TopBar title="Walk" back={paths.home()} />
        <main class="screen">
          <p class="empty" role="alert">
            This audit was deleted by {deletedBy ?? 'a teammate'}. Nothing you entered is lost; an admin can restore it. <a href={paths.home()}>Back to audits</a>
          </p>
        </main>
      </>
    );
  }

  const tagList = tags ?? [];

  const renderCard = (item: ChecklistItem, expanded: boolean, domId?: string) => {
    const owner = { kind: 'item', itemId: item.id } as const;
    const itemMedia = mediaByOwner.get(ownerKey(owner)) ?? [];
    const answer = answers.get(item.id);
    return (
      <ItemCard
        key={domId ?? item.id}
        domId={domId}
        auditId={id}
        item={item}
        answer={answer}
        expanded={expanded}
        readOnly={readOnly}
        here={hereByItem.get(item.id)}
        editedBy={answer?.updatedBy ? { name: nameOf(answer.updatedBy), at: answer.updatedAt } : undefined}
        mediaCounts={{ photos: itemMedia.filter((m) => m.type === 'photo').length, audio: itemMedia.filter((m) => m.type === 'audio').length }}
        media={
          expanded && !readOnly ? (
            <ItemMediaTools
              auditId={id}
              auditNo={audit?.header.auditNo ?? ''}
              owner={owner}
              lang={lang}
              context={item.text}
              onInterim={setInterim}
              onDictated={(text) => {
                if (noteHandle.current) noteHandle.current.append(text);
                // Field gone (note closed or card collapsed): let any pending text land first, then append to the stored note
                else void flushPendingWrites().then(() => repo.appendNote(id, item.id, text));
              }}
            />
          ) : undefined
        }
        mediaStrip={expanded ? <MediaStrip media={itemMedia} auditNo={audit?.header.auditNo ?? ''} readOnly={readOnly} /> : undefined}
        interim={expanded ? interim : undefined}
        noteRef={
          expanded
            ? (h) => {
                noteHandle.current = h;
              }
            : undefined
        }
        onToggle={() => expand(expandedId === item.id ? null : item.id)}
        onResult={(r: Result | undefined) => {
          void repo.setResult(id, item.id, r);
          // In Remaining mode a Full or N/A finishes the question: let the answer register, then open the next one.
          // No and Partial stay open until a note is written.
          if (state?.remainingOnly && (r === 'full' || r === 'na')) {
            const next = nextIncomplete(item.id, rows, answers);
            setTimeout(() => expand(next), AUTO_ADVANCE_MS);
          }
        }}
        onNote={(note) => repo.setNote(id, item.id, note)}
        onFlag={(f) => void repo.setFlag(id, item.id, f)}
        onRepeated={(r) => void repo.setRepeated(id, item.id, r)}
        onPrev={() => expand(adjacentItem(item.id, rows, -1) ?? item.id)}
        onNext={() => expand(adjacentItem(item.id, rows, 1) ?? item.id)}
        onNextUnanswered={() => expand(nextUnanswered(item.id, rows, answers) ?? item.id)}
      />
    );
  };

  const list = (
    <div class="walk-list">
      {groups.map((g) => (
        <section class="panel walk-panel" key={g.key}>
          {g.letter && (
            <header class="walk-section">
              <span class="letter">{g.letter}</span>
              <h2>{g.title}</h2>
            </header>
          )}
          <div class="walk-rows">
            {g.rows.map((row) => {
              if (row.kind === 'subsection') {
                return (
                  <h3 key={`ss-${row.id}`} class="walk-subsection">
                    <span class="sub-id">{row.id}</span>
                    <span>{row.title}</span>
                  </h3>
                );
              }
              const item = row.item!;
              // On the desk layout the list stays compact; the expanded card lives in the detail pane.
              return renderCard(item, !desk && expandedVisible && expandedId === item.id);
            })}
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <>
      <TopBar
        title="Walk"
        back={paths.home()}
        subtitle={audit?.header.auditNo || 'Untitled audit'}
        right={
          <>
            <Presence others={others} />
            <button type="button" class="btn btn-quiet btn-sm" onClick={() => setJumpOpen(true)}>
              <Icon name="jump" size={20} />
              Jump to
            </button>
          </>
        }
      />

      <div class="walk-head" ref={head}>
        {state && <ModeSwitch value={state.mode} onChange={setMode} />}
        <div class="walk-status">
          <ProgressLine answered={answered} flagged={flagged} total={TOTAL} />
          {state && (
            <label class="switch remaining-toggle">
              <input type="checkbox" checked={state.remainingOnly} onChange={(e) => update({ remainingOnly: (e.currentTarget as HTMLInputElement).checked })} />
              <span class="switch-track" aria-hidden="true" />
              <span class="switch-label">Remaining only</span>
            </label>
          )}
        </div>
        {state?.mode === 'area' && (
          <div class="chip-row" role="group" aria-label="Areas">
            {tagList.map((t) => {
              const c = counts.get(t.id) ?? { total: 0, done: 0 };
              return (
                <button key={t.id} type="button" class="tag-chip" aria-pressed={state.tag === t.id} onClick={() => update({ tag: state.tag === t.id ? null : t.id })}>
                  {t.label}
                  <span class="tag-count">
                    {c.done}/{c.total}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {state?.mode === 'search' && (
          <div class="field search-field">
            <label for="walk-search" class="visually-hidden">
              Search questions
            </label>
            <Icon name="search" size={18} class="search-icon" />
            <input
              id="walk-search"
              ref={searchBox}
              type="search"
              placeholder="Search id, question or your notes"
              value={state.query}
              onInput={(e) => update({ query: (e.currentTarget as HTMLInputElement).value })}
            />
          </div>
        )}
      </div>

      <main class={`screen has-nav walk-screen${desk ? ' walk-desk' : ''}`}>
        {readOnly && <Banner tone="info">Read-only account: you can view and export this audit but not change it.</Banner>}
        {needsBackup && !readOnly && (
          <Banner tone="warn" action={{ label: 'Export backup', onClick: () => route(paths.export(id)) }}>
            Edits not backed up for over 2 hours.
          </Banner>
        )}

        {state && tagsByItem && (
          <>
            {state.mode === 'area' && !state.tag && <p class="empty">Pick an area above to see its questions.</p>}
            {state.mode === 'search' && state.query.trim() && rows.length === 0 && <p class="empty">Nothing matches “{state.query}”.</p>}
            {state.mode === 'search' && !state.query.trim() && <p class="empty">Type an id, a word from a question, or something from your notes.</p>}
            {state.mode === 'sequence' && rows.length === 0 && <p class="empty">Every question is answered. Turn off “Remaining only” to review.</p>}

            {desk ? (
              <div class="walk-panes">
                {list}
                <div class="walk-detail" data-testid="walk-detail">
                  {expandedItem ? (
                    <div class="panel">{renderCard(expandedItem, true, `detail-${expandedItem.id}`)}</div>
                  ) : (
                    <p class="empty">
                      Select a question on the left. Keys: <kbd>1</kbd>–<kbd>4</kbd> result, <kbd>j</kbd>/<kbd>k</kbd> next/previous, <kbd>f</kbd> flag.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              list
            )}
          </>
        )}
      </main>

      <JumpSheet
        open={jumpOpen}
        answers={answers}
        onClose={() => setJumpOpen(false)}
        onJump={(firstId) => {
          setJumpOpen(false);
          update({ mode: 'sequence', remainingOnly: false, expandedId: firstId });
          scrollToItem(firstId);
        }}
      />


      <BottomNav auditId={id} />
    </>
  );
}
