ALTER TABLE leads ADD COLUMN email_status TEXT NOT NULL DEFAULT 'unchecked';
ALTER TABLE leads ADD COLUMN email_checked_at TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN email_check_note TEXT DEFAULT '';
