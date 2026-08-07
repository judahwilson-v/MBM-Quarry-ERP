-- SQL to run in Supabase SQL Editor
ALTER TABLE public.global_settings 
ADD COLUMN IF NOT EXISTS admin_pin TEXT NOT NULL DEFAULT '8888',
ADD COLUMN IF NOT EXISTS delete_pin TEXT NOT NULL DEFAULT '7711';
