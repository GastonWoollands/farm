-- =====================================================
-- REGISTRATIONS TABLE MIGRATION - INSEMINATION TRACKING
-- Farm Management System - Add Insemination Tracking to Registrations
-- =====================================================

-- Add new columns to registrations table for insemination tracking
ALTER TABLE registrations ADD COLUMN insemination_round_id TEXT;
ALTER TABLE registrations ADD COLUMN insemination_identifier TEXT;

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_registrations_insemination_round_id 
ON registrations(insemination_round_id);

CREATE INDEX IF NOT EXISTS idx_registrations_insemination_identifier 
ON registrations(insemination_identifier);

-- Create composite index for efficient queries linking mother to insemination
CREATE INDEX IF NOT EXISTS idx_registrations_mother_insemination 
ON registrations(mother_id, insemination_round_id, insemination_identifier);

-- Create index for insemination round analysis
CREATE INDEX IF NOT EXISTS idx_registrations_round_date 
ON registrations(insemination_round_id, born_date DESC);

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- Find all registrations from a specific insemination round
-- SELECT * FROM registrations WHERE insemination_round_id = '202408';

-- Find all registrations from a specific insemination
-- SELECT * FROM registrations WHERE insemination_identifier = 'INS-COW-001-1';

-- Find all registrations for a mother with their insemination details
-- SELECT r.*, i.bull_id, i.insemination_date 
-- FROM registrations r 
-- LEFT JOIN inseminations i ON r.insemination_identifier = i.insemination_identifier
-- WHERE r.mother_id = 'COW-001';

-- Analyze breeding success by round
-- SELECT insemination_round_id, COUNT(*) as births, 
--        COUNT(DISTINCT mother_id) as unique_mothers
-- FROM registrations 
-- WHERE insemination_round_id IS NOT NULL
-- GROUP BY insemination_round_id
-- ORDER BY insemination_round_id DESC;

-- =====================================================
-- NOTES
-- =====================================================

-- These columns are optional and can be NULL
-- They provide traceability from birth back to the specific insemination
-- that resulted in the pregnancy and birth
-- 
-- insemination_round_id: Links to the insemination round (e.g., "202408")
-- insemination_identifier: Links to the specific insemination record
--
-- This enables:
-- 1. Breeding analysis and success tracking
-- 2. Genetic lineage tracking
-- 3. Performance analysis by bull and round
-- 4. Data integrity and traceability
