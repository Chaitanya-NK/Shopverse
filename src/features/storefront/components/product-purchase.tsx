"use client";

import { CheckIcon, MinusIcon, PlusIcon, ShoppingBagIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/routes";
import { changeCart } from "@/features/storefront/actions";
import { Price } from "@/features/storefront/components/price";
import { type StorefrontProduct } from "@/features/storefront/schemas";
import {
  axisValues,
  findVariant,
  initialSelection,
  isChoiceAvailable,
} from "@/features/storefront/variant-selection";
import { cn } from "@/lib/utils";

type ProductPurchaseProps = {
  shopSlug: string;
  product: Pick<StorefrontProduct, "axes" | "variants">;
  currency: string;
};

export function ProductPurchase({ shopSlug, product, currency }: ProductPurchaseProps) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => initialSelection(product.variants));
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();
  const axes = axisValues(product);
  const variant = findVariant(product.variants, selected);
  const maxQty = Math.max(1, Math.min(variant?.available ?? 1, 10));
  const soldOut = !variant || variant.available <= 0;

  const add = () =>
    startTransition(async () => {
      if (!variant) return;
      const result = await changeCart({ shopSlug, variantId: variant.id, quantity, mode: "add" });
      if (!result.ok) {
        toast.error(result.error.fieldErrors?.variantId?.[0] ?? result.error.message);
        return;
      }
      toast.success(result.data.limited ? "Added what's left in stock" : "Added to your cart", {
        action: { label: "View cart", onClick: () => router.push(routes.storefrontCart(shopSlug)) },
      });
      setQuantity(1);
    });

  return (
    <div className="space-y-6">
      {variant && (
        <Price price={variant.price} compareAt={variant.compareAt} currency={currency} size="lg" />
      )}
      <p className="-mt-4 text-xs text-muted-foreground">Inclusive of all taxes</p>

      {axes.map((axis) => (
        <fieldset key={axis.key} className="space-y-2">
          <legend className="text-sm font-medium">
            {axis.label}
            {selected[axis.key] !== undefined && (
              <span className="font-normal text-muted-foreground">
                : {String(selected[axis.key])}
                {axis.unit && ` ${axis.unit}`}
              </span>
            )}
          </legend>
          <div className="flex flex-wrap gap-2">
            {axis.values.map((value) => {
              const active = selected[axis.key] === value;
              const available = isChoiceAvailable(product.variants, selected, axis.key, value);
              return (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    const next = { ...selected, [axis.key]: value };
                    // Jump to a valid combination if this one doesn't exist.
                    setSelected(
                      findVariant(product.variants, next)
                        ? next
                        : {
                            ...(product.variants.find((v) => v.options[axis.key] === value)
                              ?.options ?? next),
                          },
                    );
                    setQuantity(1);
                  }}
                  className={cn(
                    "min-w-12 rounded-lg border px-3.5 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary bg-primary/5 font-medium ring-1 ring-primary"
                      : "hover:border-foreground/40",
                    !available && !active && "text-muted-foreground line-through decoration-1",
                  )}
                >
                  {String(value)}
                  {axis.unit && typeof value === "number" && ` ${axis.unit}`}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <p
        className={cn(
          "flex items-center gap-1.5 text-sm",
          soldOut ? "text-destructive" : "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {soldOut ? (
          "Out of stock"
        ) : (
          <>
            <CheckIcon className="size-4" aria-hidden />
            {variant.available < 10 ? `Only ${variant.available} left` : "In stock"}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-lg border" role="group" aria-label="Quantity">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Fewer"
            disabled={quantity <= 1 || soldOut}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <MinusIcon />
          </Button>
          <span className="w-8 text-center tabular-nums" aria-live="polite">
            {quantity}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="More"
            disabled={quantity >= maxQty || soldOut}
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
          >
            <PlusIcon />
          </Button>
        </div>
        <Button
          size="lg"
          className="flex-1 sm:flex-none sm:px-10"
          disabled={soldOut || isPending}
          onClick={add}
        >
          {isPending ? <Spinner /> : <ShoppingBagIcon />}
          Add to cart
        </Button>
      </div>
    </div>
  );
}
