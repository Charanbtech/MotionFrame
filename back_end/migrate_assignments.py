import sqlite3
from datetime import datetime

conn = sqlite3.connect('roboflow.db')
cursor = conn.cursor()

# 1. Create assignments table
cursor.execute('''
CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    file_id INTEGER,
    user_id INTEGER,
    status VARCHAR DEFAULT 'active',
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
)
''')
cursor.execute('CREATE INDEX IF NOT EXISTS ix_assignments_project_id ON assignments (project_id)')
cursor.execute('CREATE INDEX IF NOT EXISTS ix_assignments_file_id ON assignments (file_id)')
cursor.execute('CREATE INDEX IF NOT EXISTS ix_assignments_user_id ON assignments (user_id)')

# 2. Backfill existing assignments
# Find all uploaded_files that are assigned
cursor.execute("SELECT id, file_name, assigned_to, assigned_on, status, modification FROM uploaded_files WHERE assigned_to IS NOT NULL AND assigned_to != '--' AND assigned_to != ''")
files = cursor.fetchall()

inserted = 0
skipped = 0

for file in files:
    file_id, file_name, assigned_to, assigned_on, status, modification = file
    
    # Check if assignment already exists
    cursor.execute("SELECT id FROM assignments WHERE file_id = ?", (file_id,))
    if cursor.fetchone():
        skipped += 1
        continue
        
    # Find user_id
    cursor.execute("SELECT id FROM users WHERE name = ? OR email = ? OR username = ?", (assigned_to, assigned_to, assigned_to))
    user_row = cursor.fetchone()
    if not user_row:
        print(f"User {assigned_to} not found for file {file_id}, skipping")
        skipped += 1
        continue
    user_id = user_row[0]
    
    # Find project_id
    cursor.execute("SELECT project_id FROM project_images WHERE filename = ? ORDER BY id DESC LIMIT 1", (file_name,))
    proj_row = cursor.fetchone()
    if not proj_row:
        print(f"Project not found for file {file_name}, skipping")
        skipped += 1
        continue
    project_id = proj_row[0]
    
    # Determine assignment status
    # if file status is Un assigned, assignment was revoked? No, if it was reverted, assigned_to might be null or not. 
    # But we only selected assigned_to IS NOT NULL. If status is Un assigned but assigned_to is present, maybe it's completed?
    assign_status = 'completed' if modification == 'Completed' or status == 'Completed' else 'active'
    if status == 'Un assigned' and modification != 'Completed':
        # This was probably reverted but assigned_to wasn't cleared due to a bug.
        continue
        
    # Insert
    cursor.execute(
        "INSERT INTO assignments (project_id, file_id, user_id, status, assigned_at) VALUES (?, ?, ?, ?, ?)",
        (project_id, file_id, user_id, assign_status, assigned_on or datetime.utcnow().isoformat())
    )
    inserted += 1

conn.commit()
print(f"Migration complete: {inserted} inserted, {skipped} skipped.")
conn.close()
