import type { PrismaClient } from '@prisma/client';

// Dedicated read-model mirror. Never add ChangeRequest to legacy pullSync:
// direct cloud row-copy must not decide a local request or bypass its core.
// Full bounded snapshot is intentionally used in this local prototype. Delta
// delivery/paging and provider ACLs must be proven before production wiring.
export async function approvalMirrorRows(db: PrismaClient) {
  const rows = await db.changeRequest.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const sales=await db.outgoingSale.findMany({where:{id:{in:rows.filter(r=>r.entityName==='OutgoingSale').map(r=>r.entityId)}}});
  const byId=new Map(sales.map(s=>[s.id,s]));
  return rows.map((r) => {
    const sale=r.entityName==='OutgoingSale'?byId.get(r.entityId):undefined;
    return ({
    sale_context: sale ? { date: [sale.saleDate.getFullYear(),String(sale.saleDate.getMonth()+1).padStart(2,'0'),String(sale.saleDate.getDate()).padStart(2,'0')].join('-'), book:sale.bookNumber,page:sale.pageNumber,customer:sale.partyName,vehicle:sale.vehicleNumber } : null,
    id:r.id, entity_name:r.entityName, entity_id:r.entityId, operation:r.operation,
    original_value:r.originalValue, proposed_value:r.proposedValue, reason:r.reason,
    status:r.status, requested_by_id:r.requestedById, requested_by_name:r.requestedByName,
    decided_by_id:r.decidedById, decided_by_name:r.decidedByName, decision_note:r.decisionNote,
    created_at:r.createdAt.toISOString(), decided_at:r.decidedAt?.toISOString() ?? null,
    applied_at:r.appliedAt?.toISOString() ?? null,
  }); });
}
