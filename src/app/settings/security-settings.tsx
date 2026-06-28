"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Lock, ShieldAlert, KeyRound } from "lucide-react";
import { updateGlobalSettings } from "@/app/actions/settings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export function SecuritySettings({ initialSettings }: { initialSettings: any }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [adminPin, setAdminPin] = useState(initialSettings?.adminPin || "8888");
  const [deletePin, setDeletePin] = useState(initialSettings?.deletePin || "7711");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    setIsLoading(false);

    if (error) {
      toast({
        title: "Authentication Failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Access Granted",
        description: "You have unlocked the security settings.",
      });
      setIsAuthenticated(true);
    }
  };

  const handleSavePins = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    const res = await updateGlobalSettings({
      ...initialSettings,
      adminPin,
      deletePin
    });
    
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
          <form onSubmit={handleLogin} className="space-y-4 max-w-sm">
            <Input 
              type="email" 
              placeholder="Email address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input 
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
            <label className="text-sm font-medium flex items-center">
              <KeyRound className="w-4 h-4 mr-2 text-muted-foreground"/>
              Admin Dashboard PIN
            </label>
            <Input 
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
            <label className="text-sm font-medium flex items-center">
              <KeyRound className="w-4 h-4 mr-2 text-muted-foreground"/>
              Settlement / Delete PIN
            </label>
            <Input 
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
