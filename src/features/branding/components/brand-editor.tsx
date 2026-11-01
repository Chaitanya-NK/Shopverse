"use client";

/* eslint-disable @next/next/no-img-element -- previews of fresh uploads */
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ImagePlusIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  moveBanner,
  removeBanner,
  removeLogo,
  saveBrandColor,
  updateBanner,
  uploadBrandImage,
} from "@/features/branding/actions";
import {
  type Banner,
  type BrandImageKind,
  brandImageUrl,
  type Branding,
  MAX_BANNERS,
} from "@/features/branding/schemas";
import {
  BRAND_PRESETS,
  brandTheme,
  DEFAULT_BRAND_COLOR,
  isHexColor,
} from "@/features/branding/theme";
import { ACCEPTED_IMAGE_TYPES } from "@/features/products/images";
import { initials } from "@/lib/format";
import { shrinkImage } from "@/lib/images/shrink";

type Props = { organizationSlug: string; shopId: string; shopName: string; branding: Branding };

export function BrandEditor(props: Props) {
  return (
    <div className="space-y-6">
      <ColorCard {...props} />
      <LogoCard {...props} />
      <BannersCard {...props} />
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

function useUpload(organizationSlug: string, shopId: string, kind: BrandImageKind) {
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

function BannersCard({ organizationSlug, shopId, branding }: Props) {
  const { upload, isPending, error } = useUpload(organizationSlug, shopId, "banner");
  const [moving, startMoving] = useTransition();
  const banners = branding.banners;
  const move = (b: Banner, direction: "up" | "down") =>
    startMoving(async () => {
      const result = await moveBanner({ organizationSlug, shopId, bannerId: b.id, direction });
      if (!result.ok) toast.error(result.error.message);
    });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Homepage banners</CardTitle>
          <CardDescription>
            Up to {MAX_BANNERS} wide images (about 1920 × 640) at the top of your shop, each with an
            optional headline and link. Shoppers swipe between them.
          </CardDescription>
        </div>
        <FilePicker
          label="Add banner"
          icon={<ImagePlusIcon />}
          pending={isPending}
          disabled={banners.length >= MAX_BANNERS}
          onFile={(f) => upload(f, "Banner added")}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {banners.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No banners yet. Without one, the shop shows its name and tagline in your colour.
          </p>
        ) : (
          <ol className="space-y-3" aria-busy={moving}>
            {banners.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
                <img
                  src={brandImageUrl(b.path, "banner", "small")}
                  alt={b.alt || "Banner"}
                  className="aspect-[3/1] w-48 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{b.headline || "No headline"}</p>
                  <p className="truncate text-muted-foreground">{b.link || "No link"}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move banner ${i + 1} up`}
                    disabled={i === 0 || moving}
                    onClick={() => move(b, "up")}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move banner ${i + 1} down`}
                    disabled={i === banners.length - 1 || moving}
                    onClick={() => move(b, "down")}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <BannerDialog
                    organizationSlug={organizationSlug}
                    shopId={shopId}
                    banner={b}
                    index={i}
                  />
                  <ConfirmDialog
                    title={`Remove banner ${i + 1}?`}
                    description="The image is deleted from your shop."
                    confirmLabel="Remove banner"
                    trigger={
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove banner ${i + 1}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2Icon />
                      </Button>
                    }
                    onConfirm={async () => {
                      const result = await removeBanner({
                        organizationSlug,
                        shopId,
                        bannerId: b.id,
                      });
                      if (!result.ok) {
                        toast.error(result.error.message);
                        return false;
                      }
                      toast.success("Banner removed");
                      return true;
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function BannerDialog({
  organizationSlug,
  shopId,
  banner,
  index,
}: {
  organizationSlug: string;
  shopId: string;
  banner: Banner;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    headline: banner.headline,
    subtext: banner.subtext,
    link: banner.link,
    alt: banner.alt,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();
  const field = (key: keyof typeof values, label: string, hint?: string) => (
    <Field data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={`banner-${key}`}>{label}</FieldLabel>
      <Input
        id={`banner-${key}`}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        aria-invalid={Boolean(errors[key])}
      />
      {hint && <FieldDescription>{hint}</FieldDescription>}
      {errors[key] && <FieldError>{errors[key][0]}</FieldError>}
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Edit banner ${index + 1}`}>
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Banner {index + 1}</DialogTitle>
          <DialogDescription>Everything here is optional.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          {field("headline", "Headline")}
          {field("subtext", "Text under the headline")}
          {field("link", "Link", "A page in your shop (/s/...) or a full https:// address.")}
          {field("alt", "Image description", "For screen readers, if the image says something.")}
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateBanner({
                  organizationSlug,
                  shopId,
                  bannerId: banner.id,
                  ...values,
                });
                if (!result.ok) {
                  setErrors({ ...result.error.fieldErrors } as Record<string, string[]>);
                  if (!result.error.fieldErrors) toast.error(result.error.message);
                  return;
                }
                setErrors({});
                toast.success("Banner saved");
                setOpen(false);
              })
            }
          >
            {isPending && <Spinner />}
            Save banner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
