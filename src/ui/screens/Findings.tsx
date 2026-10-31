import { useLocation } from 'preact-iso';
import { useMemo, useRef, useState } from 'preact/hooks';
import { allItems } from '../../data/checklist';
import type { Answer, Media, Positive } from '../../db/db';
import { ownerKey } from '../../db/ids';
import { repo } from '../../db/repo';
import type { ChecklistItem } from '../../domain/types';
import { appendDictated } from '../../media/dictation';
import { BottomNav } from '../components/BottomNav';
import { ItemMediaTools } from '../components/ItemMedia';
import { MediaStrip } from '../components/MediaStrip';
import { NoteField, type NoteFieldHandle } from '../components/NoteField';
import { PositiveList } from '../components/PositiveList';
import { RESULT_OPTIONS } from '../components/ResultControl';
import { TopBar } from '../components/TopBar';
import { useAudit } from '../hooks/useAudit';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { paths } from '../paths';
import { openItemInWalk } from '../walk/openItem';

function FindingRow({ auditId, item, answer, media, lang }: { auditId: string; item: ChecklistItem; answer: Answer; media: Media[]; lang: string }) {
  const { route } = useLocation();
  const [interim, setInterim] = useState('');
  const handle = useRef<NoteFieldHandle | null>(null);
  const owner = { kind: 'item', itemId: item.id } as const;
  const photos = media.filter((m) => m.type === 'photo').length;
  const label = RESULT_OPTIONS.find((o) => o.value === answer.result)?.label ?? '';
  return (
    <li class={`card finding-row is-${answer.result}`}>
      <div class="finding-head">
        <button type="button" class="finding-id" onClick={() => void openItemInWalk(auditId, item.id, route)} aria-label={`Open ${item.id} in Walk`}>
          {item.id}
        </button>
        <span class={`chip chip-result chip-${answer.result}`}>{label}</span>
        {answer.repeated && <span class="chip chip-repeated">Repeated</span>}
        {!answer.note.trim() && <span class="chip chip-missing">Missing note</span>}
        {photos === 0 && <span class="chip chip-missing">Missing photo</span>}
      </div>
      <p class="finding-question">{item.text}</p>
      <NoteField
        id={`${auditId}:${item.id}`}
        value={answer.note}
        onSave={(note) => repo.setNote(auditId, item.id, note)}
        interim={interim}
        ref={(h: NoteFieldHandle | null) => {
          handle.current = h;
        }}
      />
      <div class="item-toolbar" role="toolbar" aria-label="Finding tools">
        <ItemMediaTools
          auditId={auditId}
          owner={owner}
          lang={lang}
          onInterim={setInterim}
          onDictated={(text) => (handle.current ? handle.current.append(text) : void repo.setNote(auditId, item.id, appendDictated(answer.note, text)))}
        />
      </div>
      <MediaStrip media={media} />
    </li>
  );
}

export function Findings({ id }: { id: string }) {
  const view = useAudit(id);
  const positives = useLiveQuery<Positive[]>(() => repo.listPositives(id), [id]);
  const media = useLiveQuery<Media[]>(() => repo.listMedia(id), [id]);
  const lang = useLiveQuery(() => repo.getSetting('dictationLang', 'en-US'), []) ?? 'en-US';

  const mediaByOwner = useMemo(() => {
    const map = new Map<string, Media[]>();
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

  return (
    <>
      <TopBar title="Findings" back={paths.home()} subtitle={view?.audit?.header.auditNo || 'Untitled audit'} />
      <main class="screen has-nav">
        <section class="findings-section">
          <div class="section-head">
            <h2>Negative observations: {negatives.length}</h2>
          </div>
          {view && negatives.length === 0 ? (
            <p class="empty">No negative observations yet. Items answered No or Partial appear here with their notes and photos.</p>
          ) : (
            <ul class="list">
              {negatives.map(({ item, answer }) => (
                <FindingRow key={item.id} auditId={id} item={item} answer={answer} media={mediaByOwner.get(ownerKey({ kind: 'item', itemId: item.id })) ?? []} lang={lang} />
              ))}
            </ul>
          )}
        </section>

        <PositiveList auditId={id} positives={positives ?? []} mediaByOwner={mediaByOwner} lang={lang} />
      </main>
      <BottomNav auditId={id} />
    </>
  );
}
