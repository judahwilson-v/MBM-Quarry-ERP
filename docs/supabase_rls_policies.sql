-- Disable RLS or allow anon access to all tables so the sync engine can push changes
-- Run this in your Supabase SQL Editor

-- Disable RLS on all tables since this is an offline-first app pushing to the cloud
ALTER TABLE "vehicles" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "parties" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "materials" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "outgoing_sales" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_events" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_entries" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "day_books" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "day_book_expense_entries" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "incoming_boulder" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "party_credit" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "party_collections" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "party_ledger" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "party_payments" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_credit" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "day_book_entries" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "other_credits" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_state" DISABLE ROW LEVEL SECURITY;

-- If you prefer keeping RLS enabled, uncomment the below to create anon policies instead:
/*
CREATE POLICY "Allow public read-write on vehicles" ON "vehicles" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on parties" ON "parties" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on materials" ON "materials" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on outgoing_sales" ON "outgoing_sales" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on financial_events" ON "financial_events" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on ledger_entries" ON "ledger_entries" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on day_books" ON "day_books" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on day_book_expense_entries" ON "day_book_expense_entries" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on incoming_boulder" ON "incoming_boulder" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on party_credit" ON "party_credit" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on party_collections" ON "party_collections" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on party_ledger" ON "party_ledger" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on party_payments" ON "party_payments" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on employee_credit" ON "employee_credit" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on suppliers" ON "suppliers" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on day_book_entries" ON "day_book_entries" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on audit_logs" ON "audit_logs" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on roles" ON "roles" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on other_credits" ON "other_credits" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on expenses" ON "expenses" FOR ALL USING (true);
CREATE POLICY "Allow public read-write on sync_state" ON "sync_state" FOR ALL USING (true);
*/
ALTER TABLE "cash_transfers" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_ledgers" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "fuel_purchases" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "global_settings" DISABLE ROW LEVEL SECURITY;
