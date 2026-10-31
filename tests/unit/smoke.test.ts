import { test, expect } from 'vitest';
import Dexie from 'dexie';

test('indexeddb is available to tests', async () => {
  const db = new Dexie('smoke');
  db.version(1).stores({ t: 'id' });
  await db.table('t').put({ id: 'a' });
  expect(await db.table('t').count()).toBe(1);
});
