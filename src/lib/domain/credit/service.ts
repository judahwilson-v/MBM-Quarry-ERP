export function calculateRemainingCredit(finalAmount: number, paidTotal: number) {
  return Math.round((finalAmount - paidTotal + Number.EPSILON) * 100) / 100;
}
