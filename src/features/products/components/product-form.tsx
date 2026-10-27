"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Controller, type Resolver, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { type z } from "zod";

import { FormRootError } from "@/components/shared/form-root-error";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TrackingBadge } from "@/features/catalog/components/tracking-badge";
import { type CategoryOption } from "@/features/catalog/tree";
import {
  type AttributeDefinition,
  emptyAttributeValue,
  type FormAttributeValue,
  toFormAttributeValue,
} from "@/features/products/attribute-values";
import { createProduct, updateProduct } from "@/features/products/actions";
import { AttributeInput } from "@/features/products/components/attribute-input";
import { VariantBuilder } from "@/features/products/components/variant-builder";
import { type ProductDetail } from "@/features/products/queries";
import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  productFormSchema,
  withCategoryRules,
} from "@/features/products/schemas";
import {
  axesFromVariants,
  syncVariants,
  type VariantAxis,
  type VariantRow,
} from "@/features/products/variants";
import { routes } from "@/config/routes";
import { applyActionError } from "@/lib/forms/apply-action-error";
import { slugify } from "@/lib/slug";

/** The form holds money and numbers as strings and details as form values. */
export type ProductFormInput = {
  title: string;
  slug: string;
  description: string;
  status: (typeof PRODUCT_STATUSES)[number];
  tags: string[];
  categoryId: string;
  attributes: Record<string, FormAttributeValue>;
  hsnCode: string;
  gstRate: string;
  shopIds: string[];
  variants: VariantRow[];
};
export type ProductFormOutput = z.output<typeof productFormSchema>;

type ProductFormProps = {
  organizationSlug: string;
  categories: CategoryOption[];
  shops: { id: string; name: string }[];
  /** Omit to create a product. */
  product?: ProductDetail;
  /** Variants holding stock: their option values can't be removed. */
  stockedVariantIds?: string[];
};

const money = (n: number | null) => (n === null ? "" : String(n));

function detailFields(category: CategoryOption | undefined): AttributeDefinition[] {
  return category?.attributes.filter((a) => !a.isVariantOption) ?? [];
}
function variantFields(category: CategoryOption | undefined): AttributeDefinition[] {
  return category?.attributes.filter((a) => a.isVariantOption) ?? [];
}

function emptyAttributes(category: CategoryOption | undefined) {
  return Object.fromEntries(detailFields(category).map((d) => [d.key, emptyAttributeValue(d)]));
}

const DEFAULT_VARIANT: VariantRow = {
  options: {},
  title: "Default",
  sku: "",
  price: "",
  compareAtPrice: "",
  costPrice: "",
  barcode: "",
};

function toDefaults(
  product: ProductDetail | undefined,
  category: CategoryOption | undefined,
): ProductFormInput {
  if (!product) {
    return {
      title: "",
      slug: "",
      description: "",
      status: "draft",
      tags: [],
      categoryId: "",
      attributes: {},
      hsnCode: "",
      gstRate: "",
      shopIds: [],
      variants: [DEFAULT_VARIANT],
    };
  }
  return {
    title: product.title,
    slug: product.slug,
    description: product.description ?? "",
    status: product.status,
    tags: product.tags,
    categoryId: product.categoryId ?? "",
    attributes: Object.fromEntries(
      detailFields(category).map((d) => [
        d.key,
        toFormAttributeValue(d, product.attributes[d.key]),
      ]),
    ),
    hsnCode: product.hsnCode ?? "",
    gstRate: product.gstRate === null ? "" : String(product.gstRate),
    shopIds: product.shopIds,
    variants: product.variants.map((v) => ({
      id: v.id,
      options: v.options,
      title: v.title,
      sku: v.sku,
      price: money(v.price),
      compareAtPrice: money(v.compareAtPrice),
      costPrice: money(v.costPrice),
      barcode: v.barcode ?? "",
    })),
  };
}

export function ProductForm({
  organizationSlug,
  categories,
  shops,
  product,
  stockedVariantIds,
}: ProductFormProps) {
  const router = useRouter();
  const isEdit = Boolean(product);
  const [isPending, startTransition] = useTransition();
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const initialCategory = product?.categoryId ? categoriesById.get(product.categoryId) : undefined;

  const [axes, setAxes] = useState<VariantAxis[]>(() =>
    axesFromVariants(
      product?.variants ?? [],
      variantFields(initialCategory).map((d) => d.key),
    ),
  );

  // Validate against the *currently chosen* category's fields.
  const resolver = useMemo<Resolver<ProductFormInput, unknown, ProductFormOutput>>(
    () => (values, context, options) => {
      const category = categoriesById.get(values.categoryId);
      const schema = withCategoryRules(productFormSchema, category?.attributes ?? []);
      return (
        zodResolver(schema) as unknown as Resolver<ProductFormInput, unknown, ProductFormOutput>
      )(values, context, options);
    },
    [categoriesById],
  );

  const form = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver,
    defaultValues: toDefaults(product, initialCategory),
  });

  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const category = categoriesById.get(categoryId);
  const details = detailFields(category);
  const variantDefs = variantFields(category);

  const changeCategory = (nextId: string) => {
    const next = categoriesById.get(nextId);
    form.setValue("categoryId", nextId, { shouldValidate: form.formState.isSubmitted });
    form.setValue("attributes", emptyAttributes(next));
    const nextAxes = variantFields(next).map((d) => ({ key: d.key, values: [] }));
    setAxes(nextAxes);
    const price = form.getValues("variants")[0]?.price ?? "";
    form.setValue(
      "variants",
      syncVariants(
        [{ ...DEFAULT_VARIANT, price, sku: form.getValues("variants")[0]?.sku ?? "" }],
        nextAxes,
        {
          title: form.getValues("title"),
        },
      ),
    );
  };

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (product) {
        const result = await updateProduct({ ...values, organizationSlug, productId: product.id });
        if (!result.ok) return applyActionError(form, result.error);
        toast.success("Product saved");
        return;
      }
      const result = await createProduct({ ...values, organizationSlug });
      if (!result.ok) return applyActionError(form, result.error);
      toast.success(`${values.title} created`);
      router.push(routes.orgProduct(organizationSlug, result.data.id));
    }),
  );

  const stocked = useMemo(() => new Set(stockedVariantIds ?? []), [stockedVariantIds]);

  return (
    <form
      id="product-form"
      onSubmit={onSubmit}
      noValidate
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Controller
                name="title"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-title">Title</FieldLabel>
                    <Input
                      {...field}
                      id="product-title"
                      placeholder="Acme X1 smartphone"
                      aria-invalid={fieldState.invalid}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!slugTouched) form.setValue("slug", slugify(e.target.value, 120));
                      }}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="slug"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-slug">Handle</FieldLabel>
                    <Input
                      {...field}
                      id="product-slug"
                      className="font-mono"
                      spellCheck={false}
                      aria-invalid={fieldState.invalid}
                      onChange={(e) => {
                        setSlugTouched(true);
                        field.onChange(e.target.value.toLowerCase());
                      }}
                    />
                    <FieldDescription>
                      Used in the product’s web address in every shop.
                    </FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="description"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-description">Description</FieldLabel>
                    <Textarea
                      {...field}
                      id="product-description"
                      rows={5}
                      placeholder="What makes it worth buying?"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="tags"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-tags">Tags</FieldLabel>
                    <TagInput
                      id="product-tags"
                      value={field.value}
                      onChange={field.onChange}
                      maxLength={40}
                      placeholder="festive, bestseller"
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {category && (
          <Card>
            <CardHeader>
              <CardTitle>{category.name} details</CardTitle>
              <CardDescription>
                Defined by the category. Fields marked * are required.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {details.length > 0 ? (
                <FieldGroup className="grid gap-5 sm:grid-cols-2">
                  {details.map((def) => (
                    <Controller
                      key={`${category.id}-${def.key}`}
                      name={`attributes.${def.key}`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Field
                          data-invalid={fieldState.invalid}
                          orientation={def.type === "boolean" ? "horizontal" : "vertical"}
                          className={def.type === "multiselect" ? "sm:col-span-2" : undefined}
                        >
                          <FieldLabel htmlFor={`attr-${def.key}`}>
                            {def.label}
                            {def.unit && (
                              <span className="font-normal text-muted-foreground">
                                ({def.unit})
                              </span>
                            )}
                            {def.isRequired && <span aria-hidden>*</span>}
                          </FieldLabel>
                          <AttributeInput
                            id={`attr-${def.key}`}
                            definition={def}
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            invalid={fieldState.invalid}
                          />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )}
                    />
                  ))}
                </FieldGroup>
              ) : (
                <p className="text-sm text-muted-foreground">This category has no extra details.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Variants & pricing</CardTitle>
            <CardDescription>
              {category
                ? "Each variant has its own SKU, price and stock."
                : "Choose a category first to see its variant options."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VariantBuilder
              key={categoryId}
              form={form}
              definitions={variantDefs}
              axes={axes}
              onAxesChange={setAxes}
              lockedVariantIds={stocked}
              markNew={isEdit}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="product-status" className="sr-only">
                    Status
                  </FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="product-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {PRODUCT_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>Only active products appear in shops.</FieldDescription>
                </Field>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Controller
              name="categoryId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} data-disabled={isEdit || undefined}>
                  <FieldLabel htmlFor="product-category" className="sr-only">
                    Category
                  </FieldLabel>
                  <Select
                    value={field.value || undefined}
                    onValueChange={changeCategory}
                    disabled={isEdit}
                  >
                    <SelectTrigger
                      id="product-category"
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                    >
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupCategories(categories).map(([group, items]) => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {items.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  {isEdit && (
                    <FieldDescription>A product’s category can’t change.</FieldDescription>
                  )}
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            {category && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                Stock tracked by <TrackingBadge tracking={category.tracking} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax</CardTitle>
            <CardDescription>Leave blank to use the category’s defaults.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-2 gap-4">
              <Controller
                name="hsnCode"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-hsn">HSN</FieldLabel>
                    <Input
                      {...field}
                      id="product-hsn"
                      inputMode="numeric"
                      placeholder={category?.hsnCode ?? "8517"}
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="gstRate"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="product-gst">GST %</FieldLabel>
                    <Input
                      {...field}
                      id="product-gst"
                      inputMode="decimal"
                      placeholder={
                        category?.gstRate !== null && category?.gstRate !== undefined
                          ? String(category.gstRate)
                          : "18"
                      }
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        {shops.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sell in</CardTitle>
              <CardDescription>Shops this product is listed in.</CardDescription>
            </CardHeader>
            <CardContent>
              <Controller
                name="shopIds"
                control={form.control}
                render={({ field }) => (
                  <div className="grid gap-3">
                    {shops.map((shop) => (
                      <Field key={shop.id} orientation="horizontal">
                        <Checkbox
                          id={`product-shop-${shop.id}`}
                          checked={field.value.includes(shop.id)}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true
                                ? [...field.value, shop.id]
                                : field.value.filter((id) => id !== shop.id),
                            )
                          }
                        />
                        <FieldLabel htmlFor={`product-shop-${shop.id}`} className="font-normal">
                          {shop.name}
                        </FieldLabel>
                      </Field>
                    ))}
                  </div>
                )}
              />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 lg:sticky lg:top-20">
          <FormRootError form={form} />
          <Button type="submit" disabled={isPending} size="lg">
            {isPending && <Spinner />}
            {isEdit ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function groupCategories(categories: CategoryOption[]): [string, CategoryOption[]][] {
  const groups = new Map<string, CategoryOption[]>();
  for (const c of categories) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  return [...groups.entries()];
}
