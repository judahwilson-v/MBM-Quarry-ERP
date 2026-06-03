import { Suspense } from "react";
import { LoginForm } from "@/components/modules/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell loading />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginShell({ loading = false }: { loading?: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold tracking-normal">MBM Quarry ERP</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {loading ? "Preparing sign in..." : "Sign in to manage sales, dispatch, accounts, credit, and inventory."}
        </p>
      </div>
    </main>
  );
}
