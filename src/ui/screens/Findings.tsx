import { useLocation } from 'preact-iso';
import { useMemo, useRef, useState } from 'preact/hooks';
import { sessionStore } from '../../auth/session';
import { allItems } from '../../data/checklist';
import type { Answer, MediaRow, Positive } from '../../db/db';
import { flushPendingWrites } from '../../db/flush';
import { ownerKey } from '../../db/ids';
import { repo } from '../../db/repo';
import type { ChecklistItem } from '../../domain/types';
import { canEdit } from '../../sync/writer';
import { Banner } from '../components/Banner';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/icons';
import { ItemMediaTools } from '../components/ItemMedia';
import { MediaStrip } from '../components/MediaStrip';
import { NoteField, type NoteFieldHandle } from '../components/NoteField';
import { PositiveList } from '../components/PositiveList';
import { ReadyText } from '../components/ReadyText';
import { RESULT_OPTIONS } from '../components/ResultControl';
import { TopBar } from '../components/TopBar';
import { useAudit } from '../hooks/useAudit';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useStore } from '../hooks/useStore';
import { paths } from '../paths';
import { openItemInWalk } from '../walk/openItem';

function FindingRow({ auditId, auditNo, item, answer, media, lang, readOnly }: { auditId: string; auditNo: string; item: ChecklistItem; answer: Answer; media: MediaRow[]; lang: string; readOnly: boolean }) {
  const { route } = useLocation();
  const [interim, setInterim] = useState('');
  const handle = useRef<NoteFieldHandle | null>(null);
  const owner = { kind: 'item', itemId: item.id } as const;
  const photos = media.filter((m) => m.type === 'photo').length;
  const label = RESULT_OPTIONS.find((o) => o.value === answer.result)?.label ?? '';
  return (
    <li id={`finding-${item.id}`} class="finding">
      <div class="finding-head">
        <button type="button" class="finding-id" onClick={() => void openItemInWalk(auditId, item.id, route)} aria-label={`Open ${item.id} in Walk`}>
          {item.id}
        </button>
        <span class="finding-status">
          <i class={`dot dot-${answer.result}`} aria-hidden="true" />
          <span class={`status-word is-${answer.result}`}>{label}</span>
        </span>
        {answer.repeated && <span class="status-text">Repeated</span>}
        <span class="finding-hints">
          {!answer.note.trim() && (
            <span class="hint">
              <Icon name="warning" size={16} />
              Missing note
            </span>
          )}
          {photos === 0 && (
            <span class="hint">
              <Icon name="photo" size={16} />
              Missing photo
            </span>
          )}
        </span>
      </div>
      <p class="finding-question">{item.text}</p>
      <NoteField
        id={`${auditId}:${item.id}`}
        value={answer.note}
        onSave={(note) => repo.setNote(auditId, item.id, note)}
        interim={interim}
        disabled={readOnly}
        ref={(h: NoteFieldHandle | null) => {
          handle.current = h;
        }}
      />
      {!readOnly && (
      <div class="tool-row" role="toolbar" aria-label="Finding tools">
        <ReadyText
          itemId={item.id}
          onPick={(text) => (handle.current ? handle.current.append(text) : void flushPendingWrites().then(() => repo.appendNote(auditId, item.id, text)))}
        />
        <ItemMediaTools
          auditId={auditId}
          auditNo={auditNo}
          owner={owner}
          lang={lang}
          context={item.text}
          onInterim={setInterim}
          onDictated={(text) => (handle.current ? handle.current.append(text) : void flushPendingWrites().then(() => repo.appendNote(auditId, item.id, text)))}
        />
      </div>
      )}
      <MediaStrip media={media} auditNo={auditNo} readOnly={readOnly} />
    </li>
  );
}

export function Findings({ id }: { id: string }) {
  const view = useAudit(id);
  const positives = useLiveQuery<Positive[]>(() => repo.listPositives(id), [id]);
  const media = useLiveQuery<MediaRow[]>(() => repo.listMediaMeta(id), [id]);
  const lang = useLiveQuery(() => repo.getSetting('dictationLang', 'en-US'), []) ?? 'en-US';
  const session = useStore(sessionStore);
  const readOnly = !canEdit(session.status === 'ready' ? session.me.role : null);

  const mediaByOwner = useMemo(() => {
    const map = new Map<string, MediaRow[]>();
    for (const m of media ?? []) {
      const key = ownerKey(m.owner);
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return map;
  }, [media]);

  const answers = view?.answers ?? new Map<string, Answer>();
  const negatives = allItems()
    .map((item) => ({ item, answer: answers.get(item.id) }))
    .filter((x): x is { item: ChecklistItem; answer: Answer } => x.answer?.result === 'no' || x.answer?.result === 'partial');

  if (view && !view.audit) {
    return (
      <>
        <TopBar title="Findings" back={paths.home()} />
        <main class="screen">
          <p class="empty">
            This audit no longer exists. <a href={paths.home()}>Back to audits</a>
          </p>
        </main>
      </>
    );
  }

  const auditNo = view?.audit?.header.auditNo ?? '';

  return (
    <>
      <TopBar title="Findings" back={paths.home()} subtitle={auditNo || 'Untitled audit'} />
      <main class="screen has-nav findings-desk">
        {readOnly && <Banner tone="info">Read-only account: you can view and export this audit but not change it.</Banner>}
        <nav class="findings-index" aria-label="Findings index">
          <ul>
            {negatives.map(({ item }) => (
              <li key={item.id}>
                <button type="button" onClick={() => document.getElementById(`finding-${item.id}`)?.scrollIntoView({ block: 'start' })}>
                  <span class="idx-id">{item.id}</span>
                  <span class="idx-text">{item.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div class="findings-main">
          <section class="panel">
            <div class="panel-head">
              <h2>Negative observations: {negatives.length}</h2>
            </div>
            {view && negatives.length === 0 ? (
              <p class="empty">No negative observations yet. Questions answered No or Partial appear here with their notes and photos.</p>
            ) : (
              <ul class="rows findings-rows">
                {negatives.map(({ item, answer }) => (
                  <FindingRow key={item.id} auditId={id} auditNo={auditNo} item={item} answer={answer} media={mediaByOwner.get(ownerKey({ kind: 'item', itemId: item.id })) ?? []} lang={lang} readOnly={readOnly} />
                ))}
              </ul>
            )}
          </section>

          <PositiveList auditId={id} auditNo={auditNo} positives={positives ?? []} mediaByOwner={mediaByOwner} lang={lang} readOnly={readOnly} />
        </div>
      </main>
      <BottomNav auditId={id} />
    </>
  );
}
