import { Database } from 'sqlite3';
import { allDbRows, runDb } from '../utils/dbAsync';

/**
 * Canonical shape of `user_collections` after the vault-sync hardening work.
 *
 * The original table carried `UNIQUE(user_id, card_id, condition)`, which made it
 * impossible to store two vault entries for the same card/condition bought at
 * different prices, and forced the sync endpoint into a destructive
 * delete-then-reinsert strategy. The stable identity of a vault row is the
 * client generated `client_vault_id`, so that is what we make unique.
 */
const CREATE_TABLE_SQL = (table: string) => `
  CREATE TABLE IF NOT EXISTS ${table} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    card_id TEXT NOT NULL,
    card_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    purchase_price REAL,
    purchase_date DATETIME,
    condition TEXT,
    notes TEXT,
    card_data TEXT,
    client_vault_id TEXT,
    game TEXT NOT NULL DEFAULT 'pokemon',
    client_updated_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`;

const COPY_COLUMNS = [
  'id',
  'user_id',
  'card_id',
  'card_name',
  'quantity',
  'purchase_price',
  'purchase_date',
  'condition',
  'notes',
  'card_data',
  'client_vault_id',
  'created_at',
  'updated_at',
];

async function tableExists(db: Database, table: string): Promise<boolean> {
  const rows = await allDbRows<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table]
  );
  return rows.length > 0;
}

async function tableColumns(db: Database, table: string): Promise<string[]> {
  const rows = await allDbRows<{ name: string }>(db, `PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

async function tableSql(db: Database, table: string): Promise<string> {
  const rows = await allDbRows<{ sql: string | null }>(
    db,
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [table]
  );
  return rows[0]?.sql ?? '';
}

async function createIndexes(db: Database): Promise<void> {
  // NULLs are distinct in SQLite unique indexes, so rows created through the
  // manual "add to collection" API (no client vault id) are unaffected.
  await runDb(
    db,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_collections_client_vault ON user_collections(user_id, client_vault_id)'
  );
  await runDb(
    db,
    'CREATE INDEX IF NOT EXISTS idx_user_collections_user_game ON user_collections(user_id, game)'
  );
}

async function dropDuplicateClientVaultIds(db: Database, table: string): Promise<void> {
  await runDb(
    db,
    `DELETE FROM ${table}
      WHERE client_vault_id IS NOT NULL
        AND id NOT IN (
          SELECT MAX(id) FROM ${table}
           WHERE client_vault_id IS NOT NULL
           GROUP BY user_id, client_vault_id
        )`
  );
}

/**
 * Creates `user_collections` when missing, or rebuilds a legacy table in place.
 * Safe to call repeatedly; existing rows are preserved and their `game` value is
 * recovered from the stored client payload.
 */
export async function ensureUserCollectionsSchema(db: Database): Promise<void> {
  if (!(await tableExists(db, 'user_collections'))) {
    await runDb(db, CREATE_TABLE_SQL('user_collections'));
    await createIndexes(db);
    return;
  }

  const columns = await tableColumns(db, 'user_collections');
  const sql = await tableSql(db, 'user_collections');
  const hasLegacyUnique = /UNIQUE\s*\(\s*user_id\s*,\s*card_id\s*,\s*condition\s*\)/i.test(sql);
  const hasGame = columns.includes('game');
  const hasClientUpdatedAt = columns.includes('client_updated_at');

  if (hasGame && hasClientUpdatedAt && !hasLegacyUnique) {
    await createIndexes(db);
    return;
  }

  const available = COPY_COLUMNS.filter((c) => columns.includes(c));
  const gameExpr = hasGame
    ? 'game'
    : `CASE WHEN card_data LIKE '%"game":"onepiece"%' THEN 'onepiece' ELSE 'pokemon' END`;
  const clientUpdatedExpr = hasClientUpdatedAt ? 'client_updated_at' : 'NULL';

  await runDb(db, 'DROP TABLE IF EXISTS user_collections_v2');
  await runDb(db, CREATE_TABLE_SQL('user_collections_v2'));
  await runDb(
    db,
    `INSERT INTO user_collections_v2 (${available.join(', ')}, game, client_updated_at)
     SELECT ${available.join(', ')}, ${gameExpr}, ${clientUpdatedExpr} FROM user_collections`
  );
  await dropDuplicateClientVaultIds(db, 'user_collections_v2');
  await runDb(db, 'DROP INDEX IF EXISTS idx_user_collections_client_vault');
  await runDb(db, 'DROP INDEX IF EXISTS idx_user_collections_user_game');
  await runDb(db, 'DROP TABLE user_collections');
  await runDb(db, 'ALTER TABLE user_collections_v2 RENAME TO user_collections');
  await createIndexes(db);
}
