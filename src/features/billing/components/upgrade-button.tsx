"use client";

import { MailIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { siteConfig } from "@/config/site";

/**
 * Online subscription payments aren't connected yet; until they are, plan
 * changes are requested by email and applied by the Shopverse team.
 */
export function UpgradeButton({
  planName,
  organizationSlug,
}: {
  planName: string;
  organizationSlug: string;
}) {
  const subject = encodeURIComponent(`Switch ${organizationSlug} to ${planName}`);
  const body = encodeURIComponent(
    `Hi, please move our organisation "${organizationSlug}" to the ${planName} plan.`,
  );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full">Choose {planName}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Switch to {planName}</DialogTitle>
          <DialogDescription>
            Card and UPI billing is coming soon. For now, send us a request and we&apos;ll switch
            your plan and invoice you, usually within one working day.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button asChild>
            <a href={`mailto:${siteConfig.supportEmail}?subject=${subject}&body=${body}`}>
              <MailIcon />
              Email a request
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
