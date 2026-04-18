CREATE TABLE calibration_overrides (
  name TEXT PRIMARY KEY,
  floor INTEGER NOT NULL CHECK (floor BETWEEN 1 AND 10),
  ceiling INTEGER NOT NULL CHECK (ceiling BETWEEN 1 AND 10),
  kids_floor INTEGER CHECK (kids_floor BETWEEN 1 AND 10),
  kids_ceiling INTEGER CHECK (kids_ceiling BETWEEN 1 AND 10),
  category TEXT DEFAULT 'other',
  substances TEXT[] DEFAULT '{}',
  reason TEXT,
  confidence TEXT DEFAULT 'high' CHECK (confidence IN ('high', 'medium', 'low')),
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (floor <= ceiling)
);

CREATE INDEX idx_calibration_overrides_category ON calibration_overrides(category);
