import { useEffect, useState } from 'preact/hooks';
import { repo } from '../../db/repo';
import type { PresenceState } from '../../server/remote';
import { engine } from '../../sync/engine';
import { createStore } from '../../sync/status';
import { useStore } from './useStore';

const empty = createStore<PresenceState[]>([]);
const noDeletion = createStore<{ auditId: string; by: string } | null>(null);

/**
 * Keeps the audit's live channel open while a screen shows it and tells the channel which question is open.
 * Returns everyone else in the audit and, if a teammate deleted it meanwhile, who did.
 */
export function useAuditChannel(auditId: string, expandedId: string | null = null): { others: PresenceState[]; deletedBy: string | null } {
  const current = engine.current;
  const others = useStore(current?.presence ?? empty);
  const deleted = useStore(current?.deletedAudit ?? noDeletion);
  const [deletedBy, setDeletedBy] = useState<string | null>(null);

  useEffect(() => {
    engine.current?.openAudit(auditId);
    return () => engine.current?.closeAudit();
  }, [auditId]);

  useEffect(() => {
    engine.current?.setPresence(expandedId);
  }, [expandedId, auditId]);

  useEffect(() => {
    let cancelled = false;
    if (deleted?.auditId === auditId) {
      void repo.memberName(deleted.by).then((name) => {
        if (!cancelled) setDeletedBy(name);
      });
    } else setDeletedBy(null);
    return () => {
      cancelled = true;
    };
  }, [deleted, auditId]);

  return { others, deletedBy };
}
