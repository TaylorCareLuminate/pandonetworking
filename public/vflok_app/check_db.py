import sqlite3
db = sqlite3.connect(r'database/vflok_hospitals.db')
cur = db.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('Tables:', ', '.join(tables))
for t in tables:
    cur.execute(f'SELECT COUNT(*) FROM "{t}"')
    print(f'  {t}: {cur.fetchone()[0]:,} rows')
db.close()
