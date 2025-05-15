-- MIGRATION FILE: 20250515000000_create_grid_system.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Grids table
CREATE TABLE IF NOT EXISTS grids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grid_no INTEGER NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create Cells table (ensuring 3NF normalization by separating from grid)
CREATE TABLE IF NOT EXISTS cells (
  id SERIAL PRIMARY KEY,
  grid_id UUID NOT NULL REFERENCES grids(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  status BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  UNIQUE(grid_id, pos)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cells_grid_id ON cells(grid_id);
CREATE INDEX IF NOT EXISTS idx_cells_pos ON cells(pos);
CREATE INDEX IF NOT EXISTS idx_cells_status ON cells(status);

-- Enable Row Level Security
ALTER TABLE grids ENABLE ROW LEVEL SECURITY;
ALTER TABLE cells ENABLE ROW LEVEL SECURITY;

-- Create triggers for updated_at timestamps
DROP TRIGGER IF EXISTS set_timestamp_grids ON grids;
CREATE TRIGGER set_timestamp_grids
BEFORE UPDATE ON grids
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_cells ON cells;
CREATE TRIGGER set_timestamp_cells
BEFORE UPDATE ON cells
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Row Level Security Policies for Grids

-- Drop existing policies if they exist
DROP POLICY IF EXISTS grids_select_policy ON grids;
DROP POLICY IF EXISTS grids_insert_policy ON grids;
DROP POLICY IF EXISTS grids_update_policy ON grids;
DROP POLICY IF EXISTS grids_delete_policy ON grids;

-- Read-only access for all users
CREATE POLICY grids_select_policy ON grids
  FOR SELECT
  TO public
  USING (true);

-- No direct insert allowed for users
CREATE POLICY grids_insert_policy ON grids
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- No direct update allowed for users
CREATE POLICY grids_update_policy ON grids
  FOR UPDATE
  TO authenticated
  USING (false);

-- No direct delete allowed for users
CREATE POLICY grids_delete_policy ON grids
  FOR DELETE
  TO authenticated
  USING (false);

-- Row Level Security Policies for Cells

-- Drop existing policies if they exist
DROP POLICY IF EXISTS cells_select_policy ON cells;
DROP POLICY IF EXISTS cells_update_policy ON cells;
DROP POLICY IF EXISTS cells_insert_policy ON cells;
DROP POLICY IF EXISTS cells_delete_policy ON cells;

-- Read access for all users
CREATE POLICY cells_select_policy ON cells
  FOR SELECT
  TO public
  USING (true);

-- Update access for all users
CREATE POLICY cells_update_policy ON cells
  FOR UPDATE
  TO public
  USING (true);

-- No direct insert allowed for users
CREATE POLICY cells_insert_policy ON cells
  FOR INSERT
  TO public
  WITH CHECK (false);

-- No direct delete allowed for users
CREATE POLICY cells_delete_policy ON cells
  FOR DELETE
  TO public
  USING (false);

-- Function to create a new grid with random cell states
CREATE OR REPLACE FUNCTION create_initial_grid(grid_size INTEGER)
RETURNS UUID AS $$
DECLARE
  new_grid_id UUID;
  new_grid_no INTEGER;
  cell_pos INTEGER;
BEGIN
  -- Get next grid number
  SELECT COALESCE(MAX(grid_no), 0) + 1 INTO new_grid_no FROM grids;
  
  -- Create new grid
  INSERT INTO grids (grid_no, size)
  VALUES (new_grid_no, grid_size)
  RETURNING id INTO new_grid_id;
  
  -- Create cells with 50% chance of being lit up
  FOR cell_pos IN 0..(grid_size * grid_size - 1) LOOP
    INSERT INTO cells (grid_id, pos, status)
    VALUES (new_grid_id, cell_pos, (random() > 0.5));
  END LOOP;
  
  RETURN new_grid_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initialize with a default grid if none exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM grids LIMIT 1) THEN
    PERFORM create_initial_grid(100);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION bulk_update_cells(
  p_cell_ids INTEGER[],
  p_statuses BOOLEAN[]
)
RETURNS VOID AS $$
DECLARE
  i INTEGER;
BEGIN
  -- Check that arrays have the same length
  IF array_length(p_cell_ids, 1) != array_length(p_statuses, 1) THEN
    RAISE EXCEPTION 'Cell ID and status arrays must have the same length';
  END IF;

  -- Process each cell update using IDs
  FOR i IN 1..array_length(p_cell_ids, 1) LOOP
    UPDATE cells
    SET status = p_statuses[i], updated_at = NOW()
    WHERE id = p_cell_ids[i];
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to the public
GRANT EXECUTE ON FUNCTION bulk_update_cells TO public;