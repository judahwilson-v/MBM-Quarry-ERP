-- RedefineIndex
DROP INDEX "sqlite_autoindex_inventory_stock_2";
CREATE UNIQUE INDEX "inventory_stock_material_name_key" ON "inventory_stock"("material_name");

-- RedefineIndex
DROP INDEX "sqlite_autoindex_ledger_entries_2";
CREATE UNIQUE INDEX "ledger_entries_financial_event_id_key" ON "ledger_entries"("financial_event_id");

