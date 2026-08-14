// Quick verification that the override map produces correct column names
const SNAKE_CASE_OVERRIDES = {
  gPayPaid: "gpay_paid",
  gPayAmount: "gpay_amount",
  gPaySalesTotal: "gpay_sales_total",
};

function toSnakeCase(obj) {
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(v => toSnakeCase(v));
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = SNAKE_CASE_OVERRIDES[key] ?? key.replace(/([A-Z])/g, "_$1").toLowerCase();
      result[snakeKey] = toSnakeCase(obj[key]);
      return result;
    }, {});
  }
  return obj;
}

// Simulate an OutgoingSale audit payload
const testPayload = {
  id: "test123",
  saleDate: "2026-08-05",
  vehicleNumber: "KA01AB1234",
  partyName: "Test Party",
  materialName: "20mm",
  ratePerCft: 100,
  qty: 10,
  gPayPaid: 500,       // THE PROBLEM FIELD
  cashPaid: 200,
  bankPaid: 300,
  paidTotal: 1000,
  finalAmount: 1000,
  gstEnabled: false,
  gstRate: 5,
  gstAmount: 0,
  amount: 1000,
};

const result = toSnakeCase(testPayload);
console.log("Converted keys:", Object.keys(result).join(", "));

// Verify the critical field
if (result.gpay_paid === 500) {
  console.log("✅ PASS: gpay_paid = 500 (correct)");
} else if (result.g_pay_paid !== undefined) {
  console.log("❌ FAIL: g_pay_paid still present (old bug)");
} else {
  console.log("❌ FAIL: unexpected result");
}

// Verify other fields still work
const checks = [
  ["sale_date", "2026-08-05"],
  ["vehicle_number", "KA01AB1234"],
  ["rate_per_cft", 100],
  ["cash_paid", 200],
  ["bank_paid", 300],
  ["paid_total", 1000],
];
let allPass = true;
for (const [key, expected] of checks) {
  if (result[key] !== expected) {
    console.log(`❌ FAIL: ${key} = ${result[key]} (expected ${expected})`);
    allPass = false;
  }
}
if (allPass) console.log("✅ PASS: All other fields convert correctly");
