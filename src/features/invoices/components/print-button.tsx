"use client";

import { PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where "Save as PDF" is one of the printers. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      <PrinterIcon />
      Print or save as PDF
    </Button>
  );
}
