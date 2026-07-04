import assert from "node:assert/strict";
import {
  buildSevenDayChart,
  getDashboardDateRanges,
  summarizeLatestPartyBalances,
} from "@/lib/domain/dashboard/service";

const ranges = getDashboardDateRanges(new Date(2026, 6, 4, 23, 45, 0));
assert.deepEqual(
  [ranges.todayStart.getFullYear(), ranges.todayStart.getMonth(), ranges.todayStart.getDate(), ranges.todayStart.getHours()],
  [2026, 6, 4, 0],
);
assert.deepEqual(
  [ranges.tomorrowStart.getFullYear(), ranges.tomorrowStart.getMonth(), ranges.tomorrowStart.getDate(), ranges.tomorrowStart.getHours()],
  [2026, 6, 5, 0],
);
assert.deepEqual(
  [ranges.monthStart.getFullYear(), ranges.monthStart.getMonth(), ranges.monthStart.getDate()],
  [2026, 6, 1],
);

const balances = summarizeLatestPartyBalances([
  {
    id: "older-customer",
    partyId: "party-1",
    partyName: "Customer",
    balance: 500,
    date: new Date("2026-07-03T10:00:00Z"),
    createdAt: new Date("2026-07-03T10:00:00Z"),
  },
  {
    id: "latest-customer",
    partyId: "party-1",
    partyName: "Customer",
    balance: 300,
    date: new Date("2026-07-04T10:00:00Z"),
    createdAt: new Date("2026-07-04T10:00:00Z"),
  },
  {
    id: "supplier",
    partyId: null,
    partyName: "Legacy Supplier",
    balance: -175,
    date: new Date("2026-07-04T09:00:00Z"),
    createdAt: new Date("2026-07-04T09:00:00Z"),
  },
]);

assert.deepEqual(balances, { totalToReceive: 300, totalToPay: 175 });

const chart = buildSevenDayChart(
  new Date(2026, 6, 1),
  [{ saleDate: new Date(2026, 6, 2, 10), finalAmount: 125 }],
  [{ expenseDate: new Date(2026, 6, 2, 15), amount: 40 }],
);
assert.equal(chart.length, 7);
assert.deepEqual(chart[1], { name: "Thu", sales: 125, expenses: 40, date: "2026-07-02" });
console.log("dashboard metric tests passed");
