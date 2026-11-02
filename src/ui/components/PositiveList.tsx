import { useRef, useState } from 'preact/hooks';
import type { MediaRow, Positive } from '../../db/db';
import { flushPendingWrites } from '../../db/flush';
import { ownerKey } from '../../db/ids';
import { repo } from '../../db/repo';
import { Icon } from './icons';
import { ItemMediaTools } from './ItemMedia';
import { MediaStrip } from './MediaStrip';
import { NoteField, type NoteFieldHandle } from './NoteField';
import { toast } from './toast';

function PositiveRow({ auditId, auditNo, positive, media, lang, readOnly }: { auditId: string; auditNo: string; positive: Positive; media: MediaRow[]; lang: string; readOnly: boolean }) {
  const [interim, setInterim] = useState('');
  const handle = useRef<NoteFieldHandle | null>(null);
  const owner = { kind: 'positive', positiveId: positive.id } as const;
  return (
    <li class="finding">
      <NoteField
        id={`pos:${positive.id}`}
        label="Positive observation"
        placeholder="What was done well, and where"
        value={positive.text}
        onSave={(text) => repo.updatePositive(positive.id, text)}
        interim={interim}
        disabled={readOnly}
        ref={(h: NoteFieldHandle | null) => {
          handle.current = h;
        }}
      />
      {!readOnly && (
      <div class="tool-row" role="toolbar" aria-label="Evidence tools">
        <ItemMediaTools
          auditId={auditId}
          auditNo={auditNo}
          owner={owner}
          lang={lang}
          onInterim={setInterim}
          onDictated={(text) => (handle.current ? handle.current.append(text) : void flushPendingWrites().then(() => repo.appendPositiveText(positive.id, text)))}
        />
        <button
          type="button"
          class="icon-btn"
          onClick={() =>
            void repo.removePositive(positive.id).then(() =>
              toast('Positive observation removed', {
                action: { label: 'Undo', onClick: () => void repo.restorePositive(positive.id) },
                durationMs: 8000,
              }),
            )
          }
        >
          <Icon name="trash" />
          <span class="caption">Remove</span>
        </button>
      </div>
      )}
      <MediaStrip media={media} auditNo={auditNo} readOnly={readOnly} />
    </li>
  );
}

export function PositiveList({ auditId, auditNo, positives, mediaByOwner, lang, readOnly = false }: { auditId: string; auditNo: string; positives: Positive[]; mediaByOwner: Map<string, MediaRow[]>; lang: string; readOnly?: boolean }) {
  return (
    <section class="panel">
      <div class="panel-head">
        <h2>Positive observations: {positives.length}</h2>
        {!readOnly && (
          <button type="button" class="btn btn-sm" onClick={() => void repo.addPositive(auditId, '')}>
            <Icon name="plus" size={18} />
            Add positive observation
          </button>
        )}
      </div>
      {positives.length === 0 ? (
        <p class="empty">Good practice seen on site goes here. It ends up in Part 3 of the report.</p>
      ) : (
        <ul class="rows findings-rows">
          {positives.map((p) => (
            <PositiveRow key={p.id} auditId={auditId} auditNo={auditNo} positive={p} media={mediaByOwner.get(ownerKey({ kind: 'positive', positiveId: p.id })) ?? []} lang={lang} readOnly={readOnly} />
          ))}
        </ul>
      )}
    </section>
  );
}
