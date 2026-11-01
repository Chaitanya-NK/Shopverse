"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2Icon, ClockIcon, GlobeIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormRootError } from "@/components/shared/form-root-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { removeShopDomain, setShopDomain, verifyShopDomain } from "@/features/domains/actions";
import { isApexDomain, setDomainSchema, verificationHost } from "@/features/domains/schemas";
import { CopyField } from "@/features/payments/components/payment-settings-form";
import { applyActionError } from "@/lib/forms/apply-action-error";

type FormInput = z.input<typeof setDomainSchema>;
type FormOutput = z.output<typeof setDomainSchema>;

export function DomainSettings({
  organizationSlug,
  shopId,
  domain,
  token,
  verifiedAt,
  appHost,
  shopLive,
}: {
  organizationSlug: string;
  shopId: string;
  domain: string | null;
  token: string | null;
  verifiedAt: string | null;
  appHost: string;
  shopLive: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [checking, startChecking] = useTransition();
  const [lastCheck, setLastCheck] = useState<string[] | null>(null);
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(setDomainSchema),
    defaultValues: { organizationSlug, shopId, domain: domain ?? "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await setShopDomain(values);
      if (!result.ok) {
        applyActionError(form, result.error);
        return;
      }
      setLastCheck(null);
      toast.success("Domain saved. Add the DNS records below.");
    }),
  );

  const check = () =>
    startChecking(async () => {
      const result = await verifyShopDomain({ organizationSlug, shopId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      if (result.data.verified) toast.success(`${domain} is connected`);
      else {
        setLastCheck(result.data.found);
        toast.info("The TXT record isn't visible yet. DNS changes can take up to an hour.");
      }
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <GlobeIcon className="size-5" aria-hidden />
            Your own domain
            {domain &&
              (verifiedAt ? (
                <Badge>
                  <CheckCircle2Icon />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline">
                  <ClockIcon />
                  Waiting for DNS
                </Badge>
              ))}
          </CardTitle>
          <CardDescription>
            Serve this shop at a domain you own, like shop.yourbrand.in. It also stays available at
            its Shopverse address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Controller
              name="domain"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="max-w-md">
                  <FieldLabel htmlFor="shop-domain">Domain</FieldLabel>
                  <Input
                    id="shop-domain"
                    {...field}
                    placeholder="shop.example.com"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    A subdomain (shop.example.com) is easiest: it only needs a CNAME record.
                  </FieldDescription>
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <FormRootError form={form} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner />}
                {domain ? "Change domain" : "Add domain"}
              </Button>
              {domain && (
                <ConfirmDialog
                  title={`Disconnect ${domain}?`}
                  description="The shop stops answering on this domain. Its Shopverse address keeps working."
                  confirmLabel="Disconnect"
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2Icon />
                      Disconnect
                    </Button>
                  }
                  onConfirm={async () => {
                    const result = await removeShopDomain({ organizationSlug, shopId });
                    if (!result.ok) {
                      toast.error(result.error.message);
                      return false;
                    }
                    form.reset({ organizationSlug, shopId, domain: "" });
                    toast.success("Domain disconnected");
                    return true;
                  }}
                />
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {domain && token && (
        <Card>
          <CardHeader>
            <CardTitle>DNS records</CardTitle>
            <CardDescription>
              Add these where you bought the domain (GoDaddy, Hostinger, Cloudflare, …), then check.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="min-w-72">Value</TableHead>
                    <TableHead>Purpose</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-mono">TXT</TableCell>
                    <TableCell className="font-mono text-xs">{verificationHost(domain)}</TableCell>
                    <TableCell>
                      <CopyField value={token} label="TXT value" />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      Proves you own it
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-mono">
                      {isApexDomain(domain) ? "A / ALIAS" : "CNAME"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{domain}</TableCell>
                    <TableCell>
                      {isApexDomain(domain) ? (
                        <span className="text-sm">
                          Your hosting provider&apos;s address for {appHost} (or an ALIAS to it)
                        </span>
                      ) : (
                        <CopyField value={appHost} label="CNAME target" />
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      Sends visitors here
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <Alert>
              <AlertTitle>Where Shopverse is hosted</AlertTitle>
              <AlertDescription>
                Add {domain} to your hosting too (for example Vercel → Project → Domains) so it can
                issue an HTTPS certificate for it.
              </AlertDescription>
            </Alert>
            {!verifiedAt && (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={check} disabled={checking}>
                  {checking ? <Spinner /> : <RefreshCwIcon />}
                  Check DNS
                </Button>
                {lastCheck !== null && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {lastCheck.length === 0
                      ? `No TXT record found at ${verificationHost(domain)} yet.`
                      : `Found ${lastCheck.length} TXT record(s), but not the Shopverse one.`}
                  </p>
                )}
              </div>
            )}
            {verifiedAt && !shopLive && (
              <p className="text-sm text-muted-foreground">
                The domain is verified. It starts serving the shop once the shop is live.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
