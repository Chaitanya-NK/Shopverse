"use client";

/* eslint-disable @next/next/no-img-element -- previews of fresh uploads */
import {
  CheckIcon,
  LayoutTemplateIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { removeLogo, saveBrandColor, uploadBrandImage } from "@/features/branding/actions";
import { brandImageUrl, type Branding } from "@/features/branding/schemas";
import {
  BRAND_PRESETS,
  brandTheme,
  DEFAULT_BRAND_COLOR,
  isHexColor,
} from "@/features/branding/theme";
import { ACCEPTED_IMAGE_TYPES } from "@/features/products/images";
import { initials } from "@/lib/format";
import { shrinkImage } from "@/lib/images/shrink";

type Props = {
  organizationSlug: string;
  shopId: string;
  shopName: string;
  branding: Branding;
  designHref: string;
};

export function BrandEditor(props: Props) {
  return (
    <div className="space-y-6">
      <ColorCard {...props} />
      <LogoCard {...props} />
      <Card>
        <CardHeader>
          <CardTitle>Banners, layout and fonts</CardTitle>
          <CardDescription>
            Homepage banners are a Slideshow section in the shop&apos;s design, next to everything
            else on its pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={props.designHref}>
              <LayoutTemplateIcon />
              Open the design editor
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ColorCard({ organizationSlug, shopId, shopName, branding }: Props) {
  const saved = branding.color ?? DEFAULT_BRAND_COLOR;
  const [color, setColor] = useState(saved);
  const [isPending, startTransition] = useTransition();
  const valid = isHexColor(color);
  const theme = brandTheme(valid ? color : saved);
  const adjusted = valid && theme.primary !== color.toLowerCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Colour</CardTitle>
        <CardDescription>
          Used for buttons, links and the announcement bar. Text on it switches between white and
          black so it stays readable.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested colours">
            {BRAND_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                aria-pressed={color.toLowerCase() === c}
                onClick={() => setColor(c)}
                className="flex size-9 items-center justify-center rounded-full ring-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground"
                style={{ backgroundColor: c, color: brandTheme(c).primaryForeground }}
              >
                {color.toLowerCase() === c && <CheckIcon className="size-4" aria-hidden />}
              </button>
            ))}
          </div>
          <Field data-invalid={!valid}>
            <FieldLabel htmlFor="brand-color">Hex colour</FieldLabel>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Pick a colour"
                value={valid ? color : saved}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <Input
                id="brand-color"
                value={color}
                onChange={(e) => setColor(e.target.value.trim())}
                className="max-w-36 font-mono"
                aria-invalid={!valid}
              />
            </div>
            {!valid && <FieldError>Use six hex digits, like #1d6b5c</FieldError>}
          </Field>
          {adjusted && (
            <Alert>
              <TriangleAlertIcon />
              <AlertDescription>
                This colour is too pale to see on a white page, so the shop uses a deeper shade (
                <code>{theme.primary}</code>).
              </AlertDescription>
            </Alert>
          )}
          <Button
            disabled={!valid || isPending || color.toLowerCase() === saved}
            onClick={() =>
              startTransition(async () => {
                const result = await saveBrandColor({ organizationSlug, shopId, color });
                if (!result.ok) toast.error(result.error.message);
                else toast.success("Colour saved");
              })
            }
          >
            {isPending && <Spinner />}
            Save colour
          </Button>
        </div>
        <div aria-label="Preview" className="space-y-3 rounded-xl border p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase">Preview</p>
          <div
            className="rounded-lg px-3 py-2 text-center text-sm"
            style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
          >
            Free delivery this week
          </div>
          <div className="flex items-center gap-2">
            <span
              className="flex size-9 items-center justify-center rounded-xl text-sm font-semibold"
              style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
            >
              {initials(shopName)}
            </span>
            <span className="font-semibold">{shopName}</span>
          </div>
          <span
            className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium"
            style={{ backgroundColor: theme.primary, color: theme.primaryForeground }}
          >
            Add to cart
          </span>
          <p className="text-xs text-muted-foreground">
            Contrast with white: {theme.contrastOnWhite}:1
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function useUpload(organizationSlug: string, shopId: string, kind: "logo") {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const upload = (file: File, done: string) =>
    startTransition(async () => {
      setError(null);
      const result = await uploadBrandImage({
        organizationSlug,
        shopId,
        kind,
        file: await shrinkImage(file, kind === "logo" ? 1024 : 2560),
      });
      if (!result.ok) {
        setError(result.error.fieldErrors?.file?.[0] ?? result.error.message);
        return;
      }
      toast.success(done);
    });
  return { upload, isPending, error };
}

function FilePicker({
  label,
  onFile,
  disabled,
  pending,
  icon,
}: {
  label: string;
  onFile: (f: File) => void;
  disabled?: boolean;
  pending: boolean;
  icon: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        hidden
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pending}
        onClick={() => input.current?.click()}
      >
        {pending ? <Spinner /> : icon}
        {label}
      </Button>
    </>
  );
}

function LogoCard({ organizationSlug, shopId, shopName, branding }: Props) {
  const { upload, isPending, error } = useUpload(organizationSlug, shopId, "logo");
  const logo = branding.logo;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>
          Shown in the shop&apos;s header, browser tab and app icon. A square or wide logo on a
          transparent background works best (PNG, up to 8 MB).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 min-w-20 items-center justify-center rounded-xl border bg-muted/30 p-2">
            {logo ? (
              <img
                src={brandImageUrl(logo.path, "logo", "small")}
                alt={`${shopName} logo`}
                className="h-16 w-auto max-w-56 object-contain"
              />
            ) : (
              <span className="text-sm text-muted-foreground">No logo</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <FilePicker
              label={logo ? "Replace logo" : "Upload logo"}
              icon={<UploadIcon />}
              pending={isPending}
              onFile={(f) => upload(f, "Logo saved")}
            />
            {logo && (
              <ConfirmDialog
                title="Remove the logo?"
                description="The shop shows its initials instead."
                confirmLabel="Remove logo"
                trigger={
                  <Button variant="ghost" className="text-destructive hover:text-destructive">
                    <Trash2Icon />
                    Remove
                  </Button>
                }
                onConfirm={async () => {
                  const result = await removeLogo({ organizationSlug, shopId });
                  if (!result.ok) {
                    toast.error(result.error.message);
                    return false;
                  }
                  toast.success("Logo removed");
                  return true;
                }}
              />
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
