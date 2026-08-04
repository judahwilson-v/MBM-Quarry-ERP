import { redirect } from "next/navigation";

/**
 * /dashboard is a legacy route from the old dual-layout design.
 * The real dashboard now lives at / and is wrapped by AppShell.
 * Redirect all traffic here to avoid the double-sidebar bug.
 */
export default function DashboardPage() {
  redirect("/");
}
