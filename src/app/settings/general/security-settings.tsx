"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Lock, ShieldAlert, KeyRound } from "lucide-react";
import { updateGlobalSettings } from "@/app/actions/settings";
import { getSessionToken } from "@/lib/session-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export function SecuritySettings({ initialSettings }: { initialSettings: any }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [authError, setAuthError] = useState("");
  const [currentAdminPin, setCurrentAdminPin] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [deletePin, setDeletePin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError("");

    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    setIsLoading(false);

    if (error) {
      let errMsg = error.message || "Invalid Supabase email or password.";
      if (errMsg.toLowerCase().includes("email not confirmed")) {
        errMsg = "Email not confirmed. Please disable 'Confirm email' in your Supabase Auth dashboard, or confirm your email to log in.";
      }
      setAuthError(errMsg);
      toast({
        title: "Authentication Failed",
        description: errMsg,
        variant: "destructive"
      });
    } else {
      setAuthError("");
      toast({
        title: "Access Granted",
        description: "You have unlocked the security settings.",
      });
      setIsAuthenticated(true);
    }
  };

  const handleSavePins = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin.length < 4 || deletePin.length < 4) {
      toast({ title: "PINs Required", description: "Enter both new PINs (at least 4 digits). Current values are never displayed.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    
    const res = await updateGlobalSettings({
      ...initialSettings,
      adminPin,
      deletePin
    }, currentAdminPin || undefined, getSessionToken() ?? undefined);
    
    setIsSaving(false);
    
    if (res.success) {
      toast({
        title: "PINs Updated",
        description: "Security PINs have been successfully saved."
      });
    } else {
      toast({
        title: "Failed to save",
        description: res.message,
        variant: "destructive"
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-amber-200/20 bg-amber-500/5 shadow overflow-hidden">
        <div className="p-6 pb-4 border-b border-amber-200/20 bg-amber-500/10">
          <h3 className="tracking-tight text-lg font-semibold flex items-center text-amber-500">
            <Lock className="w-5 h-5 mr-2" />
            Super User Access Required
          </h3>
          <p className="text-sm text-muted-foreground mt-1">Sign in with your Supabase account to manage security PINs.</p>
        </div>
        <div className="p-6">
          {authError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-500 text-sm font-medium">
              ❌ {authError}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4 max-w-sm">
            <Input 
              id="secEmail"
              aria-label="Email address"
              type="email" 
              placeholder="Email address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input 
              id="secPassword"
              aria-label="Password"
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Authenticating..." : "Unlock Security Settings"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 shadow overflow-hidden">
      <div className="p-6 pb-4 border-b border-emerald-500/20 bg-emerald-500/10">
        <h3 className="tracking-tight text-lg font-semibold flex items-center text-emerald-500">
          <ShieldAlert className="w-5 h-5 mr-2" />
          Security Settings (Unlocked)
        </h3>
        <p className="text-sm text-muted-foreground mt-1">Change the PIN codes used to protect sensitive areas of the application.</p>
      </div>
      <div className="p-6">
        <form onSubmit={handleSavePins} className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <label htmlFor="adminPin" className="text-sm font-medium flex items-center">
              <KeyRound className="w-4 h-4 mr-2 text-muted-foreground"/>
              Admin Dashboard PIN
            </label>
            <Input 
              id="adminPin"
              aria-label="Admin Dashboard PIN"
              type="text" 
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              maxLength={10}
              className="font-mono text-lg tracking-widest"
              required
            />
            <p className="text-xs text-muted-foreground">Used to access the /admin page.</p>
          </div>
          
          <div className="space-y-2 pt-2">
            <label htmlFor="currentAdminPin" className="text-sm font-medium flex items-center">
              <KeyRound className="w-4 h-4 mr-2 text-muted-foreground"/>
              Current Admin PIN (required to change PINs)
            </label>
            <Input
              id="currentAdminPin"
              aria-label="Current Admin PIN"
              type="password"
              value={currentAdminPin}
              onChange={(e) => setCurrentAdminPin(e.target.value)}
              maxLength={10}
              className="font-mono text-lg tracking-widest"
              required
            />
            <p className="text-xs text-muted-foreground">Changing PINs now requires the current admin PIN.</p>
          </div>

          <div className="space-y-2 pt-2">
            <label htmlFor="deletePin" className="text-sm font-medium flex items-center">
              <KeyRound className="w-4 h-4 mr-2 text-muted-foreground"/>
              Settlement / Delete PIN
            </label>
            <Input 
              id="deletePin"
              aria-label="Settlement / Delete PIN"
              type="text" 
              value={deletePin}
              onChange={(e) => setDeletePin(e.target.value)}
              maxLength={10}
              className="font-mono text-lg tracking-widest"
              required
            />
            <p className="text-xs text-muted-foreground">Used to delete records or perform ledger settlements.</p>
          </div>
          
          <Button type="submit" disabled={isSaving} className="w-full mt-4">
            {isSaving ? "Saving..." : "Save PINs"}
          </Button>
        </form>
      </div>
    </div>
  );
}
