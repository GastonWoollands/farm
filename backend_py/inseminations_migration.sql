-- =====================================================
-- INSEMINATIONS TABLE MIGRATION
-- Farm Management System - Insemination Records
-- =====================================================

-- Create the inseminations table
CREATE TABLE IF NOT EXISTS inseminations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    insemination_identifier TEXT NOT NULL,
    insemination_round_id TEXT NOT NULL,
    mother_id TEXT NOT NULL,
    mother_visual_id TEXT NOT NULL,
    bull_id TEXT,
    insemination_date DATE NOT NULL,
    registration_date TEXT NOT NULL DEFAULT (datetime('now')),
    animal_type TEXT,
    notes TEXT,
    created_by TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    
    -- Foreign key constraint
    -- No foreign key constraint - mother_id can reference unregistered cows
);

-- Create unique constraint to prevent duplicate inseminations for same cow on same date
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mother_insemination_date 
ON inseminations(mother_id, insemination_date);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_inseminations_mother_id 
ON inseminations(mother_id);

CREATE INDEX IF NOT EXISTS idx_inseminations_mother_visual_id 
ON inseminations(mother_visual_id);

CREATE INDEX IF NOT EXISTS idx_inseminations_round_id 
ON inseminations(insemination_round_id);

CREATE INDEX IF NOT EXISTS idx_inseminations_insemination_date 
ON inseminations(insemination_date);

CREATE INDEX IF NOT EXISTS idx_inseminations_bull_id 
ON inseminations(bull_id);

CREATE INDEX IF NOT EXISTS idx_inseminations_created_by 
ON inseminations(created_by);

CREATE INDEX IF NOT EXISTS idx_inseminations_registration_date 
ON inseminations(registration_date);

-- Create composite index for efficient reporting queries
CREATE INDEX IF NOT EXISTS idx_inseminations_mother_date 
ON inseminations(mother_id, insemination_date DESC);

CREATE INDEX IF NOT EXISTS idx_inseminations_round_date 
ON inseminations(insemination_round_id, insemination_date DESC);

-- =====================================================
-- EVENT TRACKING TRIGGERS FOR INSEMINATIONS
-- =====================================================

-- Create trigger for automatic event tracking on INSERT
CREATE TRIGGER IF NOT EXISTS track_insemination_insert
AFTER INSERT ON inseminations
FOR EACH ROW
BEGIN
    INSERT INTO events_state (
        animal_id, animal_number, event_type, modified_field, old_value, new_value, 
        user_id, event_date, notes
    ) VALUES (
        NEW.mother_id, 
        NEW.mother_visual_id, 
        'inseminacion', 
        'insemination_date', 
        NULL, 
        NEW.insemination_date, 
        NEW.created_by, 
        datetime('now'), 
        NEW.notes
    );
END;

-- Create trigger for automatic event tracking on UPDATE
CREATE TRIGGER IF NOT EXISTS track_insemination_update
AFTER UPDATE ON inseminations
FOR EACH ROW
BEGIN
    -- Track insemination date changes
    INSERT INTO events_state (
        animal_id, animal_number, event_type, modified_field, old_value, new_value, 
        user_id, event_date, notes
    ) 
    SELECT NEW.mother_id, NEW.mother_visual_id, 'correccion', 'insemination_date', 
           OLD.insemination_date, NEW.insemination_date, 
           NEW.created_by, datetime('now'), NEW.notes
    WHERE OLD.insemination_date != NEW.insemination_date;
    
    -- Track bull_id changes
    INSERT INTO events_state (
        animal_id, animal_number, event_type, modified_field, old_value, new_value, 
        user_id, event_date, notes
    ) 
    SELECT NEW.mother_id, NEW.mother_visual_id, 'correccion', 'bull_id', 
           COALESCE(OLD.bull_id, 'NULL'), COALESCE(NEW.bull_id, 'NULL'), 
           NEW.created_by, datetime('now'), NEW.notes
    WHERE (OLD.bull_id IS NULL AND NEW.bull_id IS NOT NULL) 
       OR (OLD.bull_id IS NOT NULL AND NEW.bull_id IS NULL) 
       OR (OLD.bull_id != NEW.bull_id);
    
    -- Track notes changes
    INSERT INTO events_state (
        animal_id, animal_number, event_type, modified_field, old_value, new_value, 
        user_id, event_date, notes
    ) 
    SELECT NEW.mother_id, NEW.mother_visual_id, 'correccion', 'insemination_notes', 
           OLD.notes, NEW.notes, 
           NEW.created_by, datetime('now'), NEW.notes
    WHERE OLD.notes != NEW.notes;
END;

-- Create trigger for automatic event tracking on DELETE
CREATE TRIGGER IF NOT EXISTS track_insemination_delete
AFTER DELETE ON inseminations
FOR EACH ROW
BEGIN
    INSERT INTO events_state (
        animal_id, animal_number, event_type, modified_field, old_value, new_value, 
        user_id, event_date, notes
    ) VALUES (
        OLD.mother_id, 
        OLD.mother_visual_id, 
        'eliminacion_inseminacion', 
        'insemination_date', 
        OLD.insemination_date, 
        NULL, 
        OLD.created_by, 
        datetime('now'), 
        'Inseminación eliminada'
    );
END;

-- =====================================================
-- HELPER VIEWS FOR REPORTING
-- =====================================================

-- View for insemination history with cow details
CREATE VIEW IF NOT EXISTS insemination_history AS
SELECT 
    i.id as insemination_id,
    i.insemination_identifier,
    i.mother_id,
    i.mother_visual_id,
    r.animal_number as cow_number,
    r.gender as cow_gender,
    r.status as cow_status,
    i.bull_id,
    i.insemination_date,
    i.registration_date,
    i.notes,
    i.created_by,
    i.updated_at,
    -- Calculate days since insemination
    CAST(julianday('now') - julianday(i.insemination_date) AS INTEGER) as days_since_insemination
FROM inseminations i
JOIN registrations r ON i.mother_id = r.id
ORDER BY i.insemination_date DESC;

-- View for recent inseminations (last 30 days)
CREATE VIEW IF NOT EXISTS recent_inseminations AS
SELECT *
FROM insemination_history
WHERE julianday('now') - julianday(insemination_date) <= 30
ORDER BY insemination_date DESC;

-- View for insemination statistics by cow
CREATE VIEW IF NOT EXISTS cow_insemination_stats AS
SELECT 
    mother_id,
    mother_visual_id,
    cow_number,
    COUNT(*) as total_inseminations,
    MIN(insemination_date) as first_insemination,
    MAX(insemination_date) as last_insemination,
    COUNT(DISTINCT bull_id) as bulls_used,
    GROUP_CONCAT(DISTINCT bull_id, ', ') as bull_list
FROM insemination_history
GROUP BY mother_id, mother_visual_id, cow_number
ORDER BY total_inseminations DESC;

-- =====================================================
-- DATA INTEGRITY CHECKS
-- =====================================================

-- Add check constraint to ensure insemination_date is not in the future
-- Note: SQLite doesn't support CHECK constraints with datetime functions directly
-- This would be enforced at the application level

-- =====================================================
-- COMMIT CHANGES
-- =====================================================
COMMIT;
