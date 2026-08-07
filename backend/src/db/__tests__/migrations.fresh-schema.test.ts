import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Database } from 'sqlite3';
import { migrations } from '../migrations';

const db = new Database(':memory:');

function run(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (error) => (error ? reject(error) : resolve()));
  });
}

describe('fresh schema migrations', () => {
  beforeAll(async () => {
    await run(`CREATE TABLE backtest_runs (
      id INTEGER PRIMARY KEY,
      sharpe_ratio REAL,
      max_drawdown REAL,
      win_rate REAL,
      profit_factor REAL,
      market_median_return REAL,
      market_return_std_dev REAL
    )`);
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) => {
        db.close((error) => (error ? reject(error) : resolve()));
      })
  );

  it('treats backtest columns already present in the base schema as migrated', async () => {
    const backtestMigrations = migrations.filter((migration) => [14, 15].includes(migration.id));

    for (const migration of backtestMigrations) {
      await expect(migration.up(db)).resolves.toBeUndefined();
    }

    const columns = await new Promise<Array<{ name: string }>>((resolve, reject) => {
      db.all('PRAGMA table_info(backtest_runs)', (error, rows) =>
        error ? reject(error) : resolve(rows as Array<{ name: string }>)
      );
    });
    expect(new Set(columns.map((column) => column.name)).size).toBe(columns.length);
  });
});
