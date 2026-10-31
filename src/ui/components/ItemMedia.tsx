import type { MediaOwner } from '../../db/db';
import { DictateButton } from './DictateButton';
import { PhotoButton } from './PhotoButton';

/** Photo and dictation controls for one owner (question or positive observation). */
export function ItemMediaTools(props: {
  auditId: string;
  auditNo: string;
  owner: MediaOwner;
  lang: string;
  /** Text the dictation is about (the question), used to bias recognition toward its words. */
  context?: string;
  onDictated(text: string): void;
  onInterim(text: string): void;
}) {
  return (
    <>
      <PhotoButton auditId={props.auditId} auditNo={props.auditNo} owner={props.owner} />
      <DictateButton lang={props.lang} context={props.context} onText={props.onDictated} onInterim={props.onInterim} />
    </>
  );
}
