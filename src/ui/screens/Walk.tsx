import { useLocation } from 'preact-iso';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { allItems } from '../../data/checklist';
import type { Media, Tag } from '../../db/db';
import { ownerKey } from '../../db/ids';
import { repo } from '../../db/repo';
import { snapshotIfDirty, startSnapshotTimer } from '../../db/snapshots';
import type { Result } from '../../domain/types';
import { appendDictated } from '../../media/dictation';
import { Banner } from '../components/Banner';
import { BottomNav } from '../components/BottomNav';
import { ItemCard } from '../components/ItemCard';
import { ItemMediaTools } from '../components/ItemMedia';
import { JumpSheet } from '../components/JumpSheet';
import { MediaStrip } from '../components/MediaStrip';
import { ModeSwitch } from '../components/ModeSwitch';
import type { NoteFieldHandle } from '../components/NoteField';
import { ProgressLine } from '../components/ProgressLine';
import { TagEditor } from '../components/TagEditor';
import { TopBar } from '../components/TopBar';
import { useAudit } from '../hooks/useAudit';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { paths } from '../paths';
import { adjacentItem, DEFAULT_WALK_STATE, nextUnanswered, tagCounts, visibleRows, type WalkState } from '../walk/walkState';

const EXPORT_NUDGE_MS = 2 * 60 * 60 * 1000;
const TOTAL = allItems().length;

function scrollToItem(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(`item-${id}`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  });
}

export function Walk({ id }: { id: string }) {
  const { route } = useLocation();
  const view = useAudit(id);
  const tagsByItem = useLiveQuery(() => repo.listItemTags(), []);
  const tags = useLiveQuery<Tag[]>(() => repo.listTags(), []);
  const media = useLiveQuery<Media[]>(() => repo.listMedia(id), [id]);
  const lang = useLiveQuery(() => repo.getSetting('dictationLang', 'en-US'), []) ?? 'en-US';
  const [state, setState] = useState<WalkState | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [tagEditor, setTagEditor] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const noteHandle = useRef<NoteFieldHandle | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);

  const mediaByOwner = useMemo(() => {
    const map = new Map<string, Media[]>();
    for (const m of media ?? []) {
      const key = ownerKey(m.owner);
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return map;
  }, [media]);

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

  const update = (patch: Partial<WalkState>) => {
    setState((s) => {
      const next = { ...(s ?? DEFAULT_WALK_STATE), ...patch };
      void repo.setSetting(`walk:${id}`, next);
      return next;
    });
  };

  const answers = view?.answers ?? new Map();
  const rows = useMemo(
    () => (state && tagsByItem ? visibleRows(state, answers, tagsByItem) : []),
    [state, answers, tagsByItem],
  );
  const counts = useMemo(() => (tagsByItem ? tagCounts(tagsByItem, answers) : new Map()), [tagsByItem, answers]);

  const answered = [...answers.values()].filter((a) => a.result !== undefined).length;
  const flagged = [...answers.values()].filter((a) => a.flagged).length;

  const expand = (itemId: string | null) => {
    update({ expandedId: itemId });
    if (itemId) scrollToItem(itemId);
  };

  const setMode = (mode: WalkState['mode']) => {
    update({ mode });
    if (state?.expandedId) scrollToItem(state.expandedId);
    if (mode === 'search') requestAnimationFrame(() => searchBox.current?.focus());
  };

  const audit = view?.audit;
  const needsBackup =
    audit !== undefined && answered > 0 && audit.updatedAt - (audit.lastExportAt ?? audit.createdAt) > EXPORT_NUDGE_MS;

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

  const tagList = tags ?? [];
  const expandedId = state?.expandedId ?? null;
  // An item hidden by the current filter cannot stay expanded
  const expandedVisible = expandedId !== null && rows.some((r) => r.kind === 'item' && r.id === expandedId);

  return (
    <>
      <TopBar
        title="Walk"
        back={paths.home()}
        subtitle={audit?.header.auditNo || 'Untitled audit'}
        right={
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => setJumpOpen(true)}>
            Jump to
          </button>
        }
      />

      <div class="walk-head">
        {state && <ModeSwitch value={state.mode} onChange={setMode} />}
        <ProgressLine answered={answered} flagged={flagged} total={TOTAL} />
        {state?.mode === 'area' && (
          <div class="chip-row" role="group" aria-label="Areas">
            {tagList.map((t) => {
              const c = counts.get(t.id) ?? { total: 0, done: 0 };
              return (
                <button
                  key={t.id}
                  type="button"
                  class="tag-chip"
                  aria-pressed={state.tag === t.id}
                  onClick={() => update({ tag: state.tag === t.id ? null : t.id })}
                >
                  {t.label} <span class="tag-count">{c.done}/{c.total}</span>
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
        {state && (
          <label class="check-row remaining-toggle">
            <input type="checkbox" checked={state.remainingOnly} onChange={(e) => update({ remainingOnly: (e.currentTarget as HTMLInputElement).checked })} />
            <span>Remaining only</span>
          </label>
        )}
      </div>

      <main class="screen has-nav walk-screen">
        {needsBackup && (
          <Banner tone="warn" action={{ label: 'Export backup', onClick: () => route(paths.export(id)) }}>
            Edits not backed up for over 2 hours.
          </Banner>
        )}

        {state && tagsByItem && (
          <>
            {state.mode === 'area' && !state.tag && <p class="empty">Pick an area above to see its questions.</p>}
            {state.mode === 'search' && state.query.trim() && rows.length === 0 && <p class="empty">Nothing matches “{state.query}”.</p>}
            {state.mode === 'search' && !state.query.trim() && <p class="empty">Type an id, a word from a question, or something from your notes.</p>}
            {state.mode === 'sequence' && rows.length === 0 && <p class="empty">Every question is answered. Uncheck “Remaining only” to review.</p>}

            <div class="walk-list">
              {rows.map((row) => {
                if (row.kind === 'section') {
                  return (
                    <h2 key={`s-${row.id}`} class="walk-section">
                      {row.id} · {row.title}
                    </h2>
                  );
                }
                if (row.kind === 'subsection') {
                  return (
                    <h3 key={`ss-${row.id}`} class="walk-subsection">
                      {row.id} · {row.title}
                    </h3>
                  );
                }
                const item = row.item!;
                const owner = { kind: 'item', itemId: item.id } as const;
                const itemMedia = mediaByOwner.get(ownerKey(owner)) ?? [];
                const isExpanded = expandedVisible && expandedId === item.id;
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    answer={answers.get(item.id)}
                    tagIds={tagsByItem.get(item.id) ?? []}
                    tags={tagList}
                    expanded={isExpanded}
                    mediaCounts={{ photos: itemMedia.filter((m) => m.type === 'photo').length, audio: itemMedia.filter((m) => m.type === 'audio').length }}
                    media={
                      isExpanded ? (
                        <ItemMediaTools
                          auditId={id}
                          owner={owner}
                          lang={lang}
                          onInterim={setInterim}
                          onDictated={(text) => {
                            if (noteHandle.current) noteHandle.current.append(text);
                            else void repo.setNote(id, item.id, appendDictated(answers.get(item.id)?.note ?? '', text));
                          }}
                        />
                      ) : undefined
                    }
                    mediaStrip={isExpanded ? <MediaStrip media={itemMedia} /> : undefined}
                    interim={isExpanded ? interim : undefined}
                    noteRef={isExpanded ? (h) => { noteHandle.current = h; } : undefined}
                    onToggle={() => expand(expandedId === item.id ? null : item.id)}
                    onResult={(r: Result | undefined) => void repo.setResult(id, item.id, r)}
                    onNote={(note) => repo.setNote(id, item.id, note)}
                    onFlag={(f) => void repo.setFlag(id, item.id, f)}
                    onRepeated={(r) => void repo.setRepeated(id, item.id, r)}
                    onEditTags={() => setTagEditor(item.id)}
                    onPrev={() => expand(adjacentItem(item.id, rows, -1) ?? item.id)}
                    onNext={() => expand(adjacentItem(item.id, rows, 1) ?? item.id)}
                    onNextUnanswered={() => expand(nextUnanswered(item.id, rows, answers) ?? item.id)}
                  />
                );
              })}
            </div>
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

      {tagEditor && tagsByItem && (
        <TagEditor open={true} itemId={tagEditor} selected={tagsByItem.get(tagEditor) ?? []} tags={tagList} onClose={() => setTagEditor(null)} />
      )}

      <BottomNav auditId={id} />
    </>
  );
}
