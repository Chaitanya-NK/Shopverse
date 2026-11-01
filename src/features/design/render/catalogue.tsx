import { PackageSearchIcon, TruckIcon } from "lucide-react";
import Link from "next/link";

import { SimplePagination } from "@/components/shared/simple-pagination";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { routes } from "@/config/routes";
import { Slideshow, type Slide } from "@/features/design/components/slideshow";
import { shopHref, isExternal, shopLinks } from "@/features/design/links";
import { deliveryNote } from "@/features/design/queries";
import { type RenderContext, type SectionProps } from "@/features/design/render/context";
import {
  designImageSrc,
  DesignButton,
  DesignImg,
  image,
  list,
  num,
  ProductGridLayout,
  SectionFrame,
  SectionHeading,
  str,
} from "@/features/design/render/frame";
import { WishlistButton } from "@/features/shopper/components/wishlist-button";
import { CatalogFilters } from "@/features/storefront/components/catalog-filters";
import { ProductCard } from "@/features/storefront/components/product-card";
import { SortSelect } from "@/features/storefront/components/sort-select";
import {
  getCatalog,
  getStorefrontCategories,
  getStorefrontCollections,
} from "@/features/storefront/queries";
import { type CatalogItem } from "@/features/storefront/schemas";
import { loadCatalogParams, serializeCatalogParams } from "@/features/storefront/search-params";
import { cn } from "@/lib/utils";

export function ProductCards({ items, ctx }: { items: CatalogItem[]; ctx: RenderContext }) {
  return items.map((p) => (
    <ProductCard
      key={p.id}
      shopSlug={ctx.shop.slug}
      product={p}
      currency={ctx.shop.currency}
      action={
        ctx.shop.live && (
          <WishlistButton
            variant="overlay"
            shopSlug={ctx.shop.slug}
            productId={p.id}
            productTitle={p.title}
            saved={ctx.saved.has(p.id)}
            signedIn={ctx.signedIn}
          />
        )
      }
    />
  ));
}

// ---------------------------------------------------------------------------
export function SlideshowSection({ section, ctx }: SectionProps) {
  const slides: Slide[] = list(section.settings.slides).flatMap((s) => {
    const img = image(s.image);
    if (!img) return [];
    const href = shopHref(ctx.shop.slug, str(s.link));
    return [
      {
        id: str(s.id),
        ...designImageSrc(img),
        width: img.width,
        height: img.height,
        headline: ctx.t(str(s.headline)),
        subtext: ctx.t(str(s.subtext)),
        buttonLabel: ctx.t(str(s.buttonLabel)),
        href,
        external: Boolean(href && isExternal(href)),
        alt: str(s.alt) || str(s.headline),
      },
    ];
  });
  if (slides.length === 0) return null;
  return (
    <SectionFrame id={section.id}>
      <Slideshow
        slides={slides}
        label={ctx.t("{shop} highlights", { shop: ctx.shop.name })}
        height={(["small", "medium", "large"] as const).find((h) => h === section.settings.height)}
      />
    </SectionFrame>
  );
}

const HERO_HEIGHT = {
  small: "py-10 sm:py-12",
  medium: "py-12 sm:py-16",
  large: "min-h-[60vh] py-16 sm:py-24",
} as const;

export function HeroSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const img = image(s.image);
  const center = s.align === "center";
  const heading = ctx.t(str(s.heading)) || ctx.shop.name;
  const Title = ctx.index === 0 ? "h1" : "h2";
  return (
    <SectionFrame id={section.id}>
      <div
        className={cn(
          "relative isolate flex flex-col justify-center overflow-hidden rounded-3xl px-6 sm:px-10",
          HERO_HEIGHT[(s.height as keyof typeof HERO_HEIGHT) ?? "medium"] ?? HERO_HEIGHT.medium,
          img
            ? "text-white"
            : "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground",
          center && "items-center text-center",
        )}
      >
        {img && (
          <>
            <DesignImg
              image={img}
              alt=""
              sizes="100vw"
              priority={ctx.index === 0}
              className="absolute inset-0 -z-10 size-full"
            />
            <div className="absolute inset-0 -z-10 bg-black/45" aria-hidden />
          </>
        )}
        <Title className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
          {heading}
        </Title>
        {str(s.text) && <p className="mt-3 max-w-xl text-lg opacity-90">{ctx.t(str(s.text))}</p>}
        <DesignButton
          shopSlug={ctx.shop.slug}
          label={s.buttonLabel}
          link={s.link}
          variant="secondary"
          className="mt-6 w-fit"
        />
        {s.showDelivery === true && (
          <p className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-black/10 px-4 py-2 text-sm ring-1 ring-current/15 backdrop-blur-sm">
            <TruckIcon className="size-4" aria-hidden />
            {deliveryNote(ctx.shop, ctx.t)}
            {ctx.shop.paymentMethods.includes("cod") && ` · ${ctx.t("Cash on delivery")}`}
          </p>
        )}
      </div>
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
async function CollectionRow({
  sectionId,
  collection,
  heading,
  count,
  layout,
  showAll,
  ctx,
}: {
  sectionId: string;
  collection: { id: string; slug: string; title: string; description: string | null };
  heading: string;
  count: number;
  layout: string;
  showAll: boolean;
  ctx: RenderContext;
}) {
  const catalog = await getCatalog(ctx.shop.id, {
    category: null,
    q: "",
    sort: "featured",
    page: 1,
    collection: collection.id,
    limit: count,
  });
  if (catalog.items.length === 0) return null;
  return (
    <SectionFrame id={sectionId} label={heading || collection.title}>
      <SectionHeading
        title={heading || collection.title}
        subtitle={
          collection.description && <span className="line-clamp-1">{collection.description}</span>
        }
        action={
          showAll &&
          catalog.total > catalog.items.length && (
            <Link
              href={routes.storefrontCollection(ctx.shop.slug, collection.slug)}
              className="shrink-0 text-sm font-medium hover:underline"
            >
              {ctx.t("See all {count}", { count: catalog.total })}
            </Link>
          )
        }
      />
      <ProductGridLayout layout={layout}>
        <ProductCards items={catalog.items} ctx={ctx} />
      </ProductGridLayout>
    </SectionFrame>
  );
}

export async function FeaturedCollectionSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const collections = await getStorefrontCollections(ctx.shop.id);
  const chosen =
    s.collection === "auto"
      ? collections.filter((c) => c.featured)
      : collections.filter((c) => c.id === s.collection);
  if (chosen.length === 0) return null;
  const rows = chosen.map((c, i) => (
    <CollectionRow
      key={c.id}
      // The first row is the section the editor points at.
      sectionId={i === 0 ? section.id : `${section.id}-${i}`}
      collection={c}
      heading={s.collection === "auto" ? "" : ctx.t(str(s.heading))}
      count={num(s.count, 4)}
      layout={str(s.layout)}
      showAll={s.showAll !== false}
      ctx={ctx}
    />
  ));
  return rows.length === 1 ? rows[0] : <div className="space-y-10">{rows}</div>;
}

export async function ProductGridSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const source = str(s.source);
  const category = source === "category" ? str(s.category) || null : null;
  if (source === "category" && !category) return null;
  const sort = source === "rating" ? "rating" : source === "bestselling" ? "bestselling" : "newest";
  const catalog = await getCatalog(ctx.shop.id, {
    category,
    q: "",
    sort,
    page: 1,
    limit: num(s.count, 4),
    onSale: source === "sale",
  });
  if (catalog.items.length === 0) return null;
  const viewAll =
    category !== null
      ? shopLinks.category(category)
      : source === "rating"
        ? `${shopLinks.products}?sort=rating`
        : shopLinks.products;
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading))}>
      <SectionHeading
        title={ctx.t(str(s.heading))}
        action={
          s.showAll !== false &&
          catalog.total > catalog.items.length && (
            <Link
              href={shopHref(ctx.shop.slug, viewAll)!}
              className="shrink-0 text-sm font-medium hover:underline"
            >
              {ctx.t("View all")}
            </Link>
          )
        }
      />
      <ProductGridLayout layout={str(s.layout)}>
        <ProductCards items={catalog.items} ctx={ctx} />
      </ProductGridLayout>
    </SectionFrame>
  );
}

export async function ShopBySection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const [categories, collections] = await Promise.all([
    getStorefrontCategories(ctx.shop.id),
    getStorefrontCollections(ctx.shop.id),
  ]);
  const chosen = list(s.items);
  type Tile = { key: string; label: string; href: string; image: ReturnType<typeof image> };
  const tiles: Tile[] =
    chosen.length > 0
      ? chosen.flatMap((item): Tile[] => {
          const cat = categories.find((c) => c.id === item.category);
          const col = cat ? null : collections.find((c) => c.id === item.collection);
          if (!cat && !col) return [];
          return [
            {
              key: str(item.id),
              label: str(item.label) || (cat ? cat.name : col!.title),
              href: cat
                ? routes.storefrontProducts(ctx.shop.slug, { category: cat.id })
                : routes.storefrontCollection(ctx.shop.slug, col!.slug),
              image: image(item.image),
            },
          ];
        })
      : categories.map((c) => ({
          key: c.id,
          label: c.name,
          href: routes.storefrontProducts(ctx.shop.slug, { category: c.id }),
          image: null,
        }));
  if (tiles.length === 0) return null;

  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading))}>
      <SectionHeading title={ctx.t(str(s.heading))} />
      {s.style === "chips" ? (
        <nav
          aria-label={ctx.t(str(s.heading)) || ctx.t("Categories")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {tiles.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className="shrink-0 rounded-full border px-4 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-muted"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                className="group relative flex aspect-[4/3] items-end overflow-hidden rounded-2xl bg-gradient-to-br from-primary/80 to-primary p-4 text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t.image && (
                  <>
                    <DesignImg
                      image={t.image}
                      alt=""
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      className="absolute inset-0 size-full transition-transform duration-300 group-hover:scale-105"
                    />
                    <span
                      className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
                      aria-hidden
                    />
                  </>
                )}
                <span className={cn("relative text-lg font-semibold", t.image && "text-white")}>
                  {t.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
/** The full catalogue: categories, filters, sorting and pages. */
export async function CatalogueSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const filters = await loadCatalogParams(ctx.searchParams);
  const [catalog, categories, collections] = await Promise.all([
    getCatalog(ctx.shop.id, filters),
    getStorefrontCategories(ctx.shop.id),
    getStorefrontCollections(ctx.shop.id),
  ]);
  const activeCategory = categories.find((c) => c.id === filters.category);
  const filtered = filters.min !== null || filters.max !== null || filters.stock;
  const browsing = Boolean(filters.q || filters.category || filtered);
  // Category buttons and pages always lead to the all-products page.
  const productsPath = routes.storefrontProducts(ctx.shop.slug);
  const href = (patch: Partial<typeof filters>) =>
    productsPath + serializeCatalogParams({ ...filters, page: 1, ...patch });
  const title = filters.q
    ? ctx.t("Results for “{query}”", { query: filters.q })
    : (activeCategory?.name ?? (ctx.t(str(s.heading)) || ctx.t("All products")));
  const Title = ctx.index === 0 ? "h1" : "h2";

  return (
    <SectionFrame id={section.id} className="space-y-8">
      {s.showCategories !== false && (categories.length > 0 || collections.length > 0) && (
        <nav
          aria-label={ctx.t("Categories")}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          <CategoryChip href={href({ category: null })} active={!filters.category}>
            {ctx.t("All")}
          </CategoryChip>
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              href={href({ category: c.id })}
              active={c.id === filters.category}
            >
              {c.name}
            </CategoryChip>
          ))}
          {collections.map((c) => (
            <CategoryChip
              key={c.id}
              href={routes.storefrontCollection(ctx.shop.slug, c.slug)}
              active={false}
            >
              {c.title}
            </CategoryChip>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Title className="text-xl font-semibold tracking-tight">{title}</Title>
          <p className="text-sm text-muted-foreground">
            {ctx.t.plural(catalog.total, "{count} product", "{count} products")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.showFilters !== false && (
            <CatalogFilters currency={ctx.shop.currency} priceRange={catalog.price_range} />
          )}
          {s.showSort !== false && <SortSelect />}
        </div>
      </div>

      {catalog.items.length > 0 ? (
        <>
          <ProductGridLayout>
            <ProductCards items={catalog.items} ctx={ctx} />
          </ProductGridLayout>
          {catalog.pageCount > 1 && (
            <SimplePagination
              page={catalog.page}
              pageCount={catalog.pageCount}
              total={catalog.total}
              noun="products"
              t={ctx.t}
              hrefFor={(page) => productsPath + serializeCatalogParams({ ...filters, page })}
            />
          )}
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageSearchIcon />
            </EmptyMedia>
            <EmptyTitle>
              {browsing ? ctx.t("Nothing matches") : ctx.t("New arrivals coming soon")}
            </EmptyTitle>
            <EmptyDescription>
              {browsing
                ? ctx.t("Try another search, category or filter.")
                : ctx.t("This shop hasn’t listed any products yet.")}
            </EmptyDescription>
          </EmptyHeader>
          {browsing && (
            <Button asChild variant="outline">
              <Link href={productsPath}>{ctx.t("See everything")}</Link>
            </Button>
          )}
        </Empty>
      )}
    </SectionFrame>
  );
}

function CategoryChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-full border px-4 py-1.5 text-sm whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
