import sqlite3

conn = sqlite3.connect('pcc_incident_timer.db')
cursor = conn.cursor()

# Get existing columns
cursor.execute("PRAGMA table_info(incidents)")
columns = [row[1] for row in cursor.fetchall()]
print("Current columns:", columns)

# Add missing columns
if 'station' not in columns:
    cursor.execute("ALTER TABLE incidents ADD COLUMN station VARCHAR(128) NULL")
    print("✅ Added station column")
    
if 'interstation' not in columns:
    cursor.execute("ALTER TABLE incidents ADD COLUMN interstation VARCHAR(128) NULL")
    print("✅ Added interstation column")

conn.commit()

# Verify columns were added
cursor.execute("PRAGMA table_info(incidents)")
columns = [row[1] for row in cursor.fetchall()]
print("Updated columns:", columns)

conn.close()
print("✅ Database updated successfully")
