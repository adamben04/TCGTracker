import 'dotenv/config';
import path from 'path';
import sqlite3 from 'sqlite3';

const identifier = process.argv[2]?.trim();

if (!identifier) {
  console.error('Usage: npm run promote-admin -- <username-or-email>');
  process.exitCode = 1;
} else {
  const databasePath = path.resolve(process.env.DATABASE_PATH || './tcg-prices.db');
  const db = new sqlite3.Database(databasePath);

  db.run(
    "UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE username = ? OR email = ?",
    [identifier, identifier],
    function onPromote(error) {
      if (error) {
        console.error(`Unable to promote administrator: ${error.message}`);
        process.exitCode = 1;
      } else if (this.changes !== 1) {
        console.error(`Expected one matching user, updated ${this.changes}.`);
        process.exitCode = 1;
      } else {
        console.log(`Promoted ${identifier} to administrator.`);
      }

      db.close();
    }
  );
}
