import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpCircle, Download, RefreshCw, AlertTriangle, Cloud, Pencil, MousePointerClick, Move, ShieldCheck } from "lucide-react";

export default function HelpPage() {
  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Help & Training</h2>
        <p className="text-muted-foreground mt-2">
          Simple guide for employees. Learn how the system works.
        </p>
      </div>

      <div className="space-y-6">
        
        {/* Sync Section */}
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-indigo-600">
            <RefreshCw className="h-6 w-6" />
            Sync (Internet Upload)
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Sync means sharing data between this computer and the website.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            
            {/* Sync Now */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-blue-500" />
                  Sync Now
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <strong>What it does:</strong> Sends your new daily work to the internet.
                </p>
                <p className="text-sm mt-2 text-green-600 font-medium">
                  Use this every day after work.
                </p>
              </CardContent>
            </Card>

            {/* Force Push All */}
            <Card className="border-blue-500/20 bg-blue-50/50 dark:bg-blue-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-blue-700 dark:text-blue-400">
                  <ArrowUpCircle className="h-5 w-5" />
                  Force Push All Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <strong>What it does:</strong> Uploads EVERYTHING from this computer to the internet. 
                </p>
                <p className="text-sm mt-2 font-medium">
                  <strong>When to use:</strong> Use this if sales are missing on the website. It is 100% safe. It never deletes data.
                </p>
              </CardContent>
            </Card>

            {/* Restore All Data */}
            <Card className="border-red-500/20 bg-red-50/50 dark:bg-red-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-red-600">
                  <Download className="h-5 w-5" />
                  Restore All Data
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-2 mb-2 text-red-600 font-bold text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  DANGER! DELETES LOCAL DATA.
                </div>
                <p className="text-sm">
                  <strong>What it does:</strong> Wipes this computer clean and downloads old data from the internet.
                </p>
                <p className="text-sm mt-2">
                  <strong>When to use:</strong> ONLY use when setting up a brand new computer.
                </p>
              </CardContent>
            </Card>
            
            {/* Reset Cursor */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-gray-500" />
                  Reset Cursor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <strong>What it does:</strong> Makes the system check all old records again.
                </p>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Sales & Boulder Pages Help */}
        <div>
          <h3 className="text-xl font-bold mb-4 mt-8 flex items-center gap-2 text-blue-600">
            <Pencil className="h-6 w-6" />
            Sale & Boulder Pages Help
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            How to edit tables quickly using your keyboard.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MousePointerClick className="h-5 w-5 text-indigo-500" />
                  Click to Edit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <strong>What it does:</strong> Just click any number or text in the table (like Qty or Rate) to type a new value.
                </p>
                <p className="text-sm mt-2 text-indigo-600 font-medium">
                  Press Enter to save.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Move className="h-5 w-5 text-emerald-500" />
                  Keyboard Arrow Keys
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <strong>How to use:</strong> Use Up and Down arrow keys on your keyboard to move quickly between rows. Use Tab to move to the next column.
                </p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <ShieldCheck className="h-5 w-5" />
                  15-Minute Edit PIN
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  <strong>How it works:</strong> The first time you edit a cell, it will ask for the Admin/Edit PIN. After you type it once, the system remembers it for <strong>15 minutes</strong>. You can edit as many cells as you want without typing the PIN again!
                </p>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Move className="h-5 w-5 text-purple-500" />
                  Fast Keyboard Hotkeys
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li><strong>Ctrl + S</strong>: Save the current entry form instantly.</li>
                  <li><strong>Ctrl + N</strong>: Clear the form to start a New entry.</li>
                  <li><strong>Esc</strong>: Cancel what you are typing and clear the form.</li>
                  <li className="pt-2 border-t mt-2"><strong>Alt + S</strong>: Jump to the Sales page from anywhere in the app!</li>
                  <li><strong>Alt + B</strong>: Jump to the Incoming Boulders page from anywhere!</li>
                  <li><strong>Alt + V</strong>: Jump to the Vehicles page from anywhere!</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Basic Rules Section */}
        <div>
          <h3 className="text-xl font-bold mb-4 mt-8 flex items-center gap-2 text-green-600">
            <Cloud className="h-6 w-6" />
            Important Rules
          </h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-3 rounded-full text-green-600">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold">Check Internet</h4>
                    <p className="text-sm text-muted-foreground">Always check if the internet is ON before you click Sync.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-3 rounded-full text-amber-600">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold">Wait for Sync</h4>
                    <p className="text-sm text-muted-foreground">Do not close the app when Sync is spinning. Wait for it to finish.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                    <ArrowUpCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold">Fixing Website</h4>
                    <p className="text-sm text-muted-foreground">If owner says website is empty, just click &quot;Force Push All Data&quot;.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>

      </div>
    </div>
  );
}
