import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

export const digest = value => createHash('sha256').update(value).digest('hex');

export class Store {
  constructor(connectionString) {
    this.pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
    // Avoid logging connection strings, credentials or query parameter values.
    this.pool.on('error', () => console.error('workspace_database_connection_error'));
  }
  async init() { await this.pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8')); }
  async ready() { await this.pool.query('SELECT 1'); }
  async transaction(id, data) {
    await this.pool.query("INSERT INTO workspace_auth_transactions VALUES ($1, $2, now() + interval '10 minutes')", [digest(id), data]);
  }
  async consumeTransaction(id) {
    const result = await this.pool.query('DELETE FROM workspace_auth_transactions WHERE id=$1 RETURNING data, expires_at > now() AS valid', [digest(id)]);
    return result.rows[0]?.valid ? result.rows[0].data : null;
  }
  async putSession(id, session, seconds) {
    await this.pool.query("INSERT INTO workspace_sessions VALUES ($1,$2,$3,$4,$5,now() + $6 * interval '1 second')", [digest(id), session.issuer, session.sub, session.profile, session.csrf, seconds]);
  }
  async session(id) {
    const result = await this.pool.query('SELECT issuer, subject AS sub, profile, csrf FROM workspace_sessions WHERE id=$1 AND expires_at > now()', [digest(id)]);
    return result.rows[0] || null;
  }
  async logout(id) { await this.pool.query('DELETE FROM workspace_sessions WHERE id=$1', [digest(id)]); }
  async cleanup() {
    await this.pool.query('DELETE FROM workspace_auth_transactions WHERE expires_at < now()');
    await this.pool.query('DELETE FROM workspace_sessions WHERE expires_at < now()');
  }
  async beginOperation(id, session, kind, body) {
    const hash = digest(JSON.stringify(body));
    const inserted = await this.pool.query('INSERT INTO workspace_admin_operations (id,issuer,subject,kind,request_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id', [id, session.issuer, session.sub, kind, hash]);
    if (inserted.rowCount) return { fresh: true };
    const { rows: [row] } = await this.pool.query('SELECT * FROM workspace_admin_operations WHERE id=$1', [id]);
    if (row.issuer !== session.issuer || row.subject !== session.sub || row.kind !== kind || row.request_hash !== hash) return { conflict: true };
    return { fresh: false, status: row.status, objectId: row.object_id };
  }
  async finishOperation(id, status, objectId = null) {
    await this.pool.query('UPDATE workspace_admin_operations SET status=$2,object_id=$3 WHERE id=$1', [id, status, objectId]);
  }
  async createdGroups() {
    const { rows } = await this.pool.query("SELECT object_id FROM workspace_admin_operations WHERE kind='groups' AND status='completed'");
    return rows.map(row => row.object_id);
  }
  async mailOperation(id, session) {
    const { rows } = await this.pool.query("SELECT id,status FROM workspace_admin_operations WHERE id=$1 AND issuer=$2 AND subject=$3 AND kind='mail-send'", [id, session.issuer, session.sub]);
    return rows[0] || null;
  }
  async close() { await this.pool.end(); }
}
