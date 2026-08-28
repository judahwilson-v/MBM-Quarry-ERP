-- Phase 4: idempotent event inbox for the Party outbox pilot.
-- This table is cloud-side only. Device identities and delivery attempts remain
-- local; the globally unique event ID is the deduplication boundary.
CREATE TABLE IF NOT EXISTS public.sync_event_inbox (
  event_id UUID PRIMARY KEY,
  device_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type = 'Party'),
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_event_inbox_entity_idx
  ON public.sync_event_inbox (entity_type, entity_id, received_at);

-- One Postgres transaction records an event and applies its Party snapshot.
-- SECURITY INVOKER deliberately preserves the existing caller permission model;
-- it does not bypass RLS or introduce a privileged public function.
CREATE OR REPLACE FUNCTION public.apply_party_outbox_event(
  p_event_id UUID,
  p_device_id UUID,
  p_entity_id TEXT,
  p_operation TEXT,
  p_payload JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  inserted_event UUID;
BEGIN
  IF p_operation NOT IN ('create', 'update', 'delete') THEN
    RAISE EXCEPTION 'Unsupported Party outbox operation: %', p_operation;
  END IF;
  IF COALESCE(p_payload->>'id', '') <> p_entity_id THEN
    RAISE EXCEPTION 'Party outbox entity ID does not match payload ID';
  END IF;

  INSERT INTO public.sync_event_inbox (
    event_id, device_id, entity_type, entity_id, operation, payload
  ) VALUES (
    p_event_id, p_device_id, 'Party', p_entity_id, p_operation, p_payload
  ) ON CONFLICT (event_id) DO NOTHING
  RETURNING event_id INTO inserted_event;

  IF inserted_event IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_operation = 'delete' THEN
    DELETE FROM public.parties WHERE id = p_entity_id;
    RETURN TRUE;
  END IF;

  INSERT INTO public.parties (
    id, party_name, phone, address, party_group, created_at, updated_at
  ) VALUES (
    p_entity_id,
    p_payload->>'partyName',
    NULLIF(p_payload->>'phone', ''),
    NULLIF(p_payload->>'address', ''),
    NULLIF(p_payload->>'partyGroup', ''),
    COALESCE((p_payload->>'createdAt')::timestamptz AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'),
    COALESCE((p_payload->>'updatedAt')::timestamptz AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')
  ) ON CONFLICT (id) DO UPDATE SET
    party_name = EXCLUDED.party_name,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address,
    party_group = EXCLUDED.party_group,
    updated_at = EXCLUDED.updated_at;

  RETURN TRUE;
END;
$$;
