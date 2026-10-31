import type { Answer, Audit } from '../../db/db';
import { repo } from '../../db/repo';
import { useLiveQuery } from './useLiveQuery';

export interface AuditView {
  audit: Audit | undefined;
  answers: Map<string, Answer>;
}

/** Live view of one audit and its answers, keyed by item id. Undefined while loading. */
export function useAudit(id: string): AuditView | undefined {
  return useLiveQuery<AuditView>(async () => {
    const audit = await repo.getAudit(id);
    if (!audit) return { audit: undefined, answers: new Map() };
    const rows = await repo.getAnswers(id);
    return { audit, answers: new Map(rows.map((a) => [a.itemId, a])) };
  }, [id]);
}
