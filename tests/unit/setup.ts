import 'fake-indexeddb/auto';
import { setWriter } from '../../src/sync/writer';

// Unit tests write as an auditor unless a test says otherwise.
setWriter({ id: 'local', role: 'auditor' });
