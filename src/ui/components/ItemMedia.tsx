import type { Media, MediaOwner } from '../../db/db';
import { DictateButton } from './DictateButton';
import { MemoButton } from './MemoButton';
import { PhotoButton } from './PhotoButton';

/** The photo / memo / dictate controls for one owner (item or positive observation). */
export function ItemMediaTools(props: {
  auditId: string;
  owner: MediaOwner;
  lang: string;
  onDictated(text: string): void;
  onInterim(text: string): void;
}) {
  return (
    <>
      <PhotoButton auditId={props.auditId} owner={props.owner} />
      <MemoButton auditId={props.auditId} owner={props.owner} />
      <DictateButton lang={props.lang} onText={props.onDictated} onInterim={props.onInterim} />
    </>
  );
}

export type { Media };
