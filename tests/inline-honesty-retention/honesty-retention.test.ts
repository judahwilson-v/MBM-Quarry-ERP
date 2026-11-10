import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

// Inline failure-honesty + input-retention unit (bounded, FULL48):
// (a) a prior green "saved" must not imply a later inline edit succeeded;
// (b) a REFUSED inline save must not silently discard the typed text.
// AST contracts, not browser tests; actual-UI evidence belongs to independent QA.

const read=(p:string)=>readFileSync(p,'utf8');
const cell=()=>read('src/components/ui/inline-editable-cell.tsx');
const boulder=()=>read('src/components/modules/boulder-purchases-page.tsx');
const salesPage=()=>read('src/components/modules/sales-page.tsx');
const salesForm=()=>read('src/components/modules/sales-entry-form.tsx');

it('cell: ArrowUp/ArrowDown/Tab and blur may navigate or close only after a successful commit (refusal keeps the typed text)',()=>{
 const text=cell();
 expect(text).toContain('if ((await commit()) && onNavigate) onNavigate("up");');
 expect(text).toContain('if ((await commit()) && onNavigate) onNavigate("down");');
 expect(text).toContain('if ((await commit()) && onNavigate) onNavigate(e.shiftKey ? "prev" : "next");');
 expect(text).toContain('if (await commit()) setActiveCell(null);');
 // No leftover fire-and-forget pattern that navigates regardless of refusal.
 expect(text).not.toMatch(/await onSave\(temp\);\s*\n?\s*if \(onNavigate\)/);
});

it('cell: a save already in flight (its PIN prompt can steal focus and fire onBlur) blocks duplicate commit and close',()=>{
 const text=cell();
 expect(text).toContain('savingRef');
 expect(text).toContain('if (savingRef.current) return false;');
 expect(text).toContain('savingRef.current = true;');
 expect(text).toMatch(/finally \{\s*\n?\s*savingRef\.current = false;/);
});

it('cell: success navigation, unchanged passthrough and Escape discard are preserved',()=>{
 const text=cell();
 // Unchanged text commits as true without calling onSave.
 const unchIdx=text.indexOf('if (temp === String(value ?? "")) {');
 expect(unchIdx).toBeGreaterThanOrEqual(0);
 const unchBlock=text.slice(unchIdx,unchIdx+260);
 expect(unchBlock).toContain('return true;');
 expect(unchBlock).not.toContain('onSave(');
 // Enter on success still moves down or closes.
 const enterIdx=text.indexOf('e.key === "Enter"');
 expect(enterIdx).toBeGreaterThanOrEqual(0);
 const enterBlock=text.slice(enterIdx,enterIdx+320);
 expect(enterBlock).toContain('if (await commit())');
 expect(enterBlock).toContain('onNavigate("down")');
 expect(enterBlock).toContain('setActiveCell(null)');
 // Escape remains a deliberate discard: closes without committing.
 const escIdx=text.indexOf('e.key === "Escape"');
 expect(escIdx).toBeGreaterThanOrEqual(0);
 const escBlock=text.slice(escIdx,escIdx+200);
 expect(escBlock).toContain('setActiveCell(null)');
 expect(escBlock).not.toContain('commit(');
 // onSave is invoked from exactly one place (the commit helper).
 expect(text.match(/onSave\(temp\)/g)??[]).toHaveLength(1);
 // The cell stays auth-free: no PIN logic moved into it.
 expect(text).not.toContain('verifyEditPassword');
 expect(text).not.toContain('promptPassword');
});

it('boulder page: an inline edit attempt clears the earlier form success message before the save is attempted',()=>{
 const text=boulder();
 const fnIdx=text.indexOf('async function handleInlineSave');
 expect(fnIdx).toBeGreaterThanOrEqual(0);
 const body=text.slice(fnIdx,fnIdx+700);
 // Unchanged-value early return stays first (no attempt, no clearing).
 expect(body.indexOf('=== newValue) return true;')).toBeGreaterThanOrEqual(0);
 const clearIdx=body.indexOf('setMessage("");');
 const pinIdx=body.indexOf('requestEditPin()');
 expect(clearIdx).toBeGreaterThanOrEqual(0);
 expect(pinIdx).toBeGreaterThanOrEqual(0);
 expect(clearIdx).toBeLessThan(pinIdx);
});

it('sales page: an inline edit attempt signals the entry form to clear its earlier success message',()=>{
 const page=salesPage();
 const fnIdx=page.indexOf('async function handleInlineSave');
 expect(fnIdx).toBeGreaterThanOrEqual(0);
 const body=page.slice(fnIdx,fnIdx+700);
 expect(body.indexOf('=== newValue) return true;')).toBeGreaterThanOrEqual(0);
 const signalIdx=body.indexOf('setMessageResetSignal(');
 const pinIdx=body.indexOf('requestEditPin()');
 expect(signalIdx).toBeGreaterThanOrEqual(0);
 expect(pinIdx).toBeGreaterThanOrEqual(0);
 expect(signalIdx).toBeLessThan(pinIdx);
 expect(page).toContain('messageResetSignal={messageResetSignal}');

 const form=salesForm();
 expect(form).toContain('messageResetSignal?: number;');
 expect(form).toMatch(/useEffect\(\(\) => \{\s*\n?\s*if \(messageResetSignal\) setMessage\(""\);\s*\n?\s*\}, \[messageResetSignal\]\);/);
});

it('cell: cross-cell retention - a real save marks retention from attempt start; only success or a reverted (unchanged) draft clears it',()=>{
 const text=cell();
 // The page hands the shared retention registry to the cell.
 expect(text).toContain('retentionRef?: React.MutableRefObject<boolean>;');
 // Unchanged draft (user reverted the text) releases retention without a save.
 const unchangedIdx=text.indexOf('if (temp === String(value ?? ""))');
 expect(unchangedIdx).toBeGreaterThanOrEqual(0);
 const unchangedBlock=text.slice(unchangedIdx,unchangedIdx+220);
 expect(unchangedBlock).toContain('retentionRef.current = false;');
 // Retention is marked BEFORE the async save begins, so a cross-cell click
 // landing while the save is in flight is already gated.
 const markIdx=text.indexOf('retentionRef.current = true;');
 const saveIdx=text.indexOf('await onSave(temp)');
 expect(markIdx).toBeGreaterThanOrEqual(0);
 expect(saveIdx).toBeGreaterThanOrEqual(0);
 expect(markIdx).toBeLessThan(saveIdx);
 // Success releases retention; refusal keeps it.
 expect(text).toContain('if (ok && retentionRef) retentionRef.current = false;');
 // The in-flight early return must not clobber the pending attempt's state.
 const inflightIdx=text.indexOf('if (savingRef.current) return false;');
 expect(inflightIdx).toBeLessThan(markIdx);
});

it('cell: Escape remains a deliberate discard and releases retention before closing',()=>{
 const text=cell();
 const escIdx=text.indexOf('e.key === "Escape"');
 expect(escIdx).toBeGreaterThanOrEqual(0);
 const escBlock=text.slice(escIdx,escIdx+260);
 const relIdx=escBlock.indexOf('retentionRef.current = false;');
 const closeIdx=escBlock.indexOf('setActiveCell(null);');
 expect(relIdx).toBeGreaterThanOrEqual(0);
 expect(closeIdx).toBeGreaterThanOrEqual(0);
 expect(relIdx).toBeLessThan(closeIdx);
 expect(escBlock).not.toContain('commit(');
});

it('pages: cross-cell switching is gated on retention and every inline cell receives the registry (sale and boulder)',()=>{
 for (const page of [salesPage(),boulder()]) {
  // Switching to another cell is refused while a draft is retained; closing
  // (null) stays allowed so Escape and successful commits still work.
  expect(page).toContain('if (cell !== null && retentionRef.current) return;');
  const cells=(page.match(/<InlineEditableCell/g)??[]).length;
  expect(cells).toBeGreaterThan(0);
  const wired=(page.match(/retentionRef=\{retentionRef\}/g)??[]).length;
  expect(wired).toBe(cells);
 }
});

it('pages: an inline edit attempt clears the previous error so a stale red cannot outlive a successful retry (sale and boulder)',()=>{
 for (const page of [salesPage(),boulder()]) {
  const fnIdx=page.indexOf('async function handleInlineSave');
  expect(fnIdx).toBeGreaterThanOrEqual(0);
  const body=page.slice(fnIdx,fnIdx+900);
  // Unchanged-value early return stays first (no attempt, no clearing).
  expect(body.indexOf('=== newValue) return true;')).toBeGreaterThanOrEqual(0);
  const clearIdx=body.indexOf('setError("");');
  const pinIdx=body.indexOf('requestEditPin()');
  expect(clearIdx).toBeGreaterThanOrEqual(0);
  expect(pinIdx).toBeGreaterThanOrEqual(0);
  expect(clearIdx).toBeLessThan(pinIdx);
  // The failure paths still set the error; only a fresh attempt clears it.
  expect(page.slice(fnIdx,fnIdx+2500)).toContain('Failed to update cell.');
 }
});
