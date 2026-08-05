import { verifyEditPassword } from "@/app/actions/auth";

export default async function TestAuthPage() {
  let result = "pending";
  let errorMsg = "";
  try {
    const isValid = await verifyEditPassword("7711", "delete");
    result = isValid ? "Valid" : "Invalid";
  } catch (e: any) {
    result = "Error";
    errorMsg = e.message;
  }
  return <div>
    <h1>Test Auth</h1>
    <p>Result: {result}</p>
    <p>Error: {errorMsg}</p>
  </div>;
}
