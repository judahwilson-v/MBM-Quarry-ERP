import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = createClient();
  
  const { data } = await supabase.auth.getUser();
  if (data?.user) {
    redirect("/");
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-card text-card-foreground p-10 shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">Sign In</h2>
          <p className="mt-2 text-sm text-muted-foreground">Owner Remote Dashboard Access</p>
          <p className="mt-4 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50 p-2 rounded">
            Note: The local POS application does not require login. This page is only for cloud/remote dashboard access.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
