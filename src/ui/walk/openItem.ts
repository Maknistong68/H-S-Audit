import { repo } from '../../db/repo';
import { paths } from '../paths';
import type { WalkState } from './walkState';

/** Opens the Walk screen with one item expanded (sequence mode, no filter). */
export async function openItemInWalk(auditId: string, itemId: string, route: (url: string) => void): Promise<void> {
  const key = `walk:${auditId}`;
  const saved = await repo.getSetting<Partial<WalkState>>(key, {});
  await repo.setSetting(key, { ...saved, mode: 'sequence', remainingOnly: false, expandedId: itemId });
  route(paths.walk(auditId));
}
