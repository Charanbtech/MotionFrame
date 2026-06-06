import sqlite3
import pandas as pd

conn = sqlite3.connect('back_end/roboflow.db')
tables = pd.read_sql("SELECT name FROM sqlite_master WHERE type='table';", conn)
print("TABLES:")
print(tables)

for table in tables['name']:
    print(f"\nSCHEMA for {table}:")
    schema = pd.read_sql(f"PRAGMA table_info({table});", conn)
    print(schema)
