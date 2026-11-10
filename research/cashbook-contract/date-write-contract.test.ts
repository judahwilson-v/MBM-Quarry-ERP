import {it,expect} from 'vitest';import {businessTimestampForWrite} from './date-write-contract';
it('date-only label stays its intended local business date',()=>{const d=businessTimestampForWrite('2026-11-09');expect(d.getFullYear()).toBe(2026);expect(d.getMonth()).toBe(10);expect(d.getDate()).toBe(9);expect(d.getHours()).toBe(0);});
it('actual timestamp instant is preserved exactly',()=>{expect(businessTimestampForWrite('2026-11-09T19:22:31Z').toISOString()).toBe('2026-11-09T19:22:31.000Z');});
it('invalid and overflow date labels refuse instead of rolling into another month',()=>{expect(()=>businessTimestampForWrite('2026-02-30')).toThrow();expect(()=>businessTimestampForWrite('not-a-date')).toThrow();});
