ALTER TABLE advertising_events
  ADD COLUMN IF NOT EXISTS visitor_key CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_advertising_events_unique_impression_visitor
  ON advertising_events(campaign_id,visitor_key)
  WHERE event_type='impression' AND visitor_key IS NOT NULL;
