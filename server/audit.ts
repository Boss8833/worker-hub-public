import { run } from './db.ts';

// Never pass secrets in `detail`.
export function audit(action: string, entity: string, entityId: string | number, detail = '') {
  run('INSERT INTO audit_logs(action, entity, entity_id, detail) VALUES (?, ?, ?, ?)', action, entity, String(entityId), detail);
}
