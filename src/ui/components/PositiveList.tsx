import { useRef, useState } from 'preact/hooks';
import type { Media, Positive } from '../../db/db';
import { ownerKey } from '../../db/ids';
import { repo } from '../../db/repo';
import { appendDictated } from '../../media/dictation';
import { ItemMediaTools } from './ItemMedia';
import { MediaStrip } from './MediaStrip';
import { NoteField, type NoteFieldHandle } from './NoteField';
import { toast } from './toast';

function PositiveRow({ auditId, positive, media, lang }: { auditId: string; positive: Positive; media: Media[]; lang: string }) {
  const [interim, setInterim] = useState('');
  const handle = useRef<NoteFieldHandle | null>(null);
  const owner = { kind: 'positive', positiveId: positive.id } as const;
  return (
    <li class="card finding-row">
      <NoteField
        id={`pos:${positive.id}`}
        label="Positive observation"
        placeholder="What was done well, and where"
        value={positive.text}
        onSave={(text) => repo.updatePositive(positive.id, text)}
        interim={interim}
        ref={(h: NoteFieldHandle | null) => {
          handle.current = h;
        }}
      />
      <div class="item-toolbar" role="toolbar" aria-label="Evidence tools">
        <ItemMediaTools
          auditId={auditId}
          owner={owner}
          lang={lang}
          onInterim={setInterim}
          onDictated={(text) => (handle.current ? handle.current.append(text) : void repo.updatePositive(positive.id, appendDictated(positive.text, text)))}
        />
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          onClick={() =>
            void repo.removePositive(positive.id).then(() =>
              toast('Positive observation removed', {
                action: { label: 'Undo', onClick: () => void repo.restorePositive(positive.id) },
                durationMs: 8000,
              }),
            )
          }
        >
          Remove
        </button>
      </div>
      <MediaStrip media={media} />
    </li>
  );
}

export function PositiveList({ auditId, positives, mediaByOwner, lang }: { auditId: string; positives: Positive[]; mediaByOwner: Map<string, Media[]>; lang: string }) {
  return (
    <section class="findings-section">
      <div class="section-head">
        <h2>Positive observations: {positives.length}</h2>
        <button type="button" class="btn btn-sm" onClick={() => void repo.addPositive(auditId, '')}>
          Add positive observation
        </button>
      </div>
      {positives.length === 0 ? (
        <p class="empty">Good practice seen on site goes here — it ends up in Part 3 of the report.</p>
      ) : (
        <ul class="list">
          {positives.map((p) => (
            <PositiveRow key={p.id} auditId={auditId} positive={p} media={mediaByOwner.get(ownerKey({ kind: 'positive', positiveId: p.id })) ?? []} lang={lang} />
          ))}
        </ul>
      )}
    </section>
  );
}
