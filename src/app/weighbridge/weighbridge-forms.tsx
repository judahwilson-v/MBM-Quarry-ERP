"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { createWeighbridgeTicket, completeWeighbridgeTicket } from "@/app/actions/weighbridge";
import { Plus, Scale, Truck } from "lucide-react";
import { WeighbridgeTicket } from "@prisma/client";

export function NewTicketDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [ticketType, setTicketType] = useState<"OUTGOING" | "INCOMING">("OUTGOING");
  const [weight, setWeight] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleNumber || !weight) return;

    setLoading(true);
    const result = await createWeighbridgeTicket({
      vehicleNumber,
      ticketType,
      weight: parseFloat(weight)
    });

    setLoading(false);
    if (result.success) {
      setOpen(false);
      setVehicleNumber("");
      setWeight("");
    } else {
      alert("Error creating ticket: " + result.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Ticket (First Weight)
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Capture First Weight</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ticketType">Ticket Type</Label>
              <Select 
                value={ticketType} 
                onValueChange={(val) => setTicketType(val as "OUTGOING" | "INCOMING")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OUTGOING">Outgoing (Selling Material)</SelectItem>
                  <SelectItem value="INCOMING">Incoming (Buying Material)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="vehicleNumber">Vehicle Number</Label>
              <Input
                id="vehicleNumber"
                placeholder="e.g. MH-12-AB-1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="weight">First Weight (MT)</Label>
              <div className="relative">
                <Scale className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="weight"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-9"
                  placeholder="0.00"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  required
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {ticketType === "OUTGOING" ? "Capturing Tare (Empty) Weight" : "Capturing Gross (Loaded) Weight"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Weight"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteTicketDialog({ 
  ticket, 
  open, 
  onOpenChange 
}: { 
  ticket: WeighbridgeTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [weight, setWeight] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !weight) return;

    setLoading(true);
    const result = await completeWeighbridgeTicket(ticket.id, parseFloat(weight));
    setLoading(false);

    if (result.success) {
      onOpenChange(false);
      setWeight("");
    } else {
      alert("Error completing ticket: " + result.message);
    }
  };

  if (!ticket) return null;

  const isIncoming = ticket.ticketType === "INCOMING";
  const firstWeight = isIncoming ? ticket.grossWeight : ticket.tareWeight;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Complete Ticket (Second Weight)</DialogTitle>
          </DialogHeader>
          
          <div className="bg-muted/50 p-4 rounded-lg my-4 flex items-center gap-4 border">
            <Truck className="h-8 w-8 text-primary" />
            <div>
              <div className="font-bold text-lg">{ticket.vehicleNumber}</div>
              <div className="text-xs text-muted-foreground">Ticket #{ticket.ticketNumber} • {ticket.ticketType}</div>
              <div className="text-sm mt-1">First Weight: <span className="font-mono">{firstWeight?.toFixed(2)} MT</span></div>
            </div>
          </div>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="secondWeight">Second Weight (MT)</Label>
              <div className="relative">
                <Scale className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="secondWeight"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-9 text-lg font-mono"
                  placeholder="0.00"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  required
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {isIncoming ? "Capturing Tare (Empty) Weight" : "Capturing Gross (Loaded) Weight"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Final Weight"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
