-- Phase A cloud schema update. Safe to run more than once.

ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS admin_pin TEXT NOT NULL DEFAULT '8888',
  ADD COLUMN IF NOT EXISTS delete_pin TEXT NOT NULL DEFAULT '7711';

CREATE TABLE IF NOT EXISTS public.inventory_stock (
  id TEXT PRIMARY KEY NOT NULL,
  material_name TEXT NOT NULL UNIQUE,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'TONS',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  stock_id TEXT NOT NULL REFERENCES public.inventory_stock(id) ON DELETE CASCADE ON UPDATE CASCADE,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  quantity_change DOUBLE PRECISION NOT NULL,
  reference_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_transactions_stock_id_idx
  ON public.inventory_transactions(stock_id);

CREATE INDEX IF NOT EXISTS inventory_transactions_date_idx
  ON public.inventory_transactions(date);

-- Keep new tables closed until the authenticated policies are applied.
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
