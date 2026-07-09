ALTER TABLE audit_events
    ALTER COLUMN event_payload TYPE TEXT
    USING event_payload::text;
