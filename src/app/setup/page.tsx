"use client";

import { useState } from "react";
import { updateGlobalSettings } from "@/app/actions/settings";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Rocket } from "lucide-react";

export default function SetupWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    quarryName: "",
    gstNumber: "",
    adminPin: "8888",
    deletePin: "7711",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.quarryName.trim()) return;
    setLoading(true);
    
    try {
      await updateGlobalSettings({
        ...formData,
        enableWeighbridge: false,
        enableFleetMaintenance: false,
        enableCustomerPortal: false,
        enableCreditLocks: false,
      });
      router.push("/");
    } catch (error) {
      console.error("Setup failed:", error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col justify-center items-center p-4">
      <Card className="w-full max-w-lg shadow-lg border-primary/20">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-2">
            <Rocket className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome to MBM Quarry ERP</CardTitle>
          <CardDescription>
            Let&apos;s configure your system for first-time use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="setup-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="quarryName">Company / Quarry Name <span className="text-red-500">*</span></Label>
              <Input
                id="quarryName"
                name="quarryName"
                value={formData.quarryName}
                onChange={handleChange}
                placeholder="e.g. MBM Stone Crushers"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gstNumber">GST Number</Label>
              <Input
                id="gstNumber"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleChange}
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="adminPin">Admin PIN</Label>
                <Input
                  id="adminPin"
                  name="adminPin"
                  type="password"
                  maxLength={4}
                  value={formData.adminPin}
                  onChange={handleChange}
                  required
                />
                <p className="text-xs text-muted-foreground">Default: 8888</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deletePin">Delete PIN</Label>
                <Input
                  id="deletePin"
                  name="deletePin"
                  type="password"
                  maxLength={4}
                  value={formData.deletePin}
                  onChange={handleChange}
                  required
                />
                <p className="text-xs text-muted-foreground">Default: 7711</p>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button type="submit" form="setup-form" className="w-full" disabled={loading || !formData.quarryName.trim()}>
            {loading ? "Configuring..." : "Complete Setup"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
