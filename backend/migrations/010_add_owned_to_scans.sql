-- Adds owned BOOLEAN to scans for explicit ownership state.
-- Default TRUE so the column lands honestly: every existing row predates
-- the toggle UI and was a real user scan, almost all of which the user
-- owns. Frontend "Just looking" toggle sets owned=false at scan time;
-- POST /scan/:id/ownership lets users flip after the fact (Track 5 bulk
-- edit screen will surface this in aggregate).
--
-- This is the foundation for accurate home metrics. Track 3's /home-data
-- endpoint will filter aggregations on owned=true so store-aisle scans
-- and "just looking" scans don't skew the user's home score.

ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS owned BOOLEAN NOT NULL DEFAULT TRUE;
