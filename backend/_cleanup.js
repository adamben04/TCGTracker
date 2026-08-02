const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('tcg-prices.db');
db.get("SELECT COUNT(*) as c FROM price_history WHERE source = 'backfill'", [], (e,r) => {
  console.log('Backfill rows:', r ? r.c : 0);
  db.get("SELECT COUNT(*) as c FROM price_history", [], (e2,r2) => {
    console.log('Total price_history:', r2 ? r2.c : 0);
    if (r && r.c > 0) {
      db.run("DELETE FROM price_history WHERE source = 'backfill'", [], (e3) => {
        console.log('Deleted backfill rows:', e3 ? e3.message : 'success');
        db.close();
      });
    } else {
      db.close();
    }
  });
});
