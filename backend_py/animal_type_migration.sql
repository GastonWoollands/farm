-- Animal Type Migration Script
-- Populates animal_type column based on existing gender data

-- Add animal_type column if it doesn't exist
ALTER TABLE registrations ADD COLUMN animal_type INTEGER;

-- Update animal_type based on gender
UPDATE registrations 
SET animal_type = CASE 
    WHEN gender = 'FEMALE' THEN 1  -- Cow
    WHEN gender = 'MALE' THEN 2    -- Bull
    ELSE NULL                      -- Unknown gender
END;

-- Verify the migration
SELECT 
    gender, 
    animal_type, 
    COUNT(*) as count 
FROM registrations 
GROUP BY gender, animal_type 
ORDER BY gender, animal_type;
