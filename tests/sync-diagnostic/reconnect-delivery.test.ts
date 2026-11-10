import {it,expect,vi} from 'vitest';import {deliverPendingOnPoll} from '../../src/lib/sync/reconnect-delivery';
it('offline saved work delivers on later online poll, idle polls and parked-only status do not replay',async()=>{
 const busy={current:false};const send=vi.fn(async()=>{});expect(await deliverPendingOnPoll({pendingCount:1,status:'IDLE'},false,busy,send)).toBe(false);expect(send).not.toHaveBeenCalled();
 expect(await deliverPendingOnPoll({pendingCount:1,status:'IDLE'},true,busy,send)).toBe(true);expect(send).toHaveBeenCalledTimes(1);
 expect(await deliverPendingOnPoll({pendingCount:0,status:'IDLE'},true,busy,send)).toBe(false);expect(send).toHaveBeenCalledTimes(1);
});
it('failure releases gate and next scheduled poll retries; active work keeps one shared in-flight owner',async()=>{
 const busy={current:false};const fail=vi.fn(async()=>{throw Error('Synthetic outage');});await expect(deliverPendingOnPoll({pendingCount:1,status:'ERROR'},true,busy,fail)).rejects.toThrow('Synthetic outage');expect(busy.current).toBe(false);
 let finish!:()=>void;const send=vi.fn(()=>new Promise<void>(r=>finish=r));const first=deliverPendingOnPoll({pendingCount:1,status:'PARTIAL_SUCCESS'},true,busy,send);expect(busy.current).toBe(true);expect(await deliverPendingOnPoll({pendingCount:1,status:'IDLE'},true,busy,send)).toBe(false);finish();await first;expect(busy.current).toBe(false);expect(send).toHaveBeenCalledTimes(1);
 expect(await deliverPendingOnPoll({pendingCount:1,status:'SYNCING'},true,busy,send)).toBe(false);
});
