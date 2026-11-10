"use client";

import { useEffect, useState } from "react";
import { login, logout } from "@/app/actions/auth";
import { getSessionToken, getSessionName, setSession, clearSession } from "@/lib/session-client";
import { Button } from "@/components/ui/button";
import { UserCircle } from "lucide-react";

// Worker login for attribution. The client stores only the opaque session
// token; the server resolves who the actor is from that token.
export function WorkerLogin() {
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [inputName, setInputName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getSessionToken()) setName(getSessionName());
  }, []);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await login(inputName, pin);
    setBusy(false);
    if (res.success) {
      setSession(res.token as string, res.name as string);
      setName(res.name as string);
      setOpen(false);
      setPin("");
    } else {
      setError(res.message || "Login failed.");
    }
  };

  const doLogout = async () => {
    await logout(getSessionToken());
    clearSession();
    setName(null);
  };

  if (name) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <UserCircle className="h-4 w-4" />
          {name}
        </span>
        <Button variant="ghost" size="sm" onClick={doLogout}>Log out</Button>
      </div>
    );
  }

  if (!open) {
    return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Worker login</Button>;
  }

  return (
    <form onSubmit={doLogin} className="flex items-center gap-1">
      <input
        className="h-8 w-28 rounded-md border bg-background px-2 text-xs"
        placeholder="Name"
        value={inputName}
        onChange={(e) => setInputName(e.target.value)}
        autoFocus
      />
      <input
        className="h-8 w-20 rounded-md border bg-background px-2 text-xs"
        placeholder="PIN"
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={busy}>{busy ? "..." : "Log in"}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setError(""); }}>X</Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
