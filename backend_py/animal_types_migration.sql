-- Animal Types Migration
-- Creates the animal_types lookup table and populates it with default values

-- Create animal_types table
CREATE TABLE IF NOT EXISTS animal_types (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- Insert default animal types
INSERT OR IGNORE INTO animal_types (id, name, description) VALUES 
(1, 'cow', 'Female cattle'),
(2, 'bull', 'Male cattle');

-- Verify the data
SELECT * FROM animal_types ORDER BY id;
