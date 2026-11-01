import {
  AwardIcon,
  BanknoteIcon,
  ClockIcon,
  GiftIcon,
  HeartIcon,
  LeafIcon,
  type LucideIcon,
  MapPinIcon,
  PhoneIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
  StoreIcon,
  TruckIcon,
} from "lucide-react";
import Link from "next/link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { Countdown } from "@/features/design/components/countdown";
import { NewsletterForm } from "@/features/design/components/newsletter-form";
import { VideoPlayer } from "@/features/design/components/video-player";
import { parseVideo } from "@/features/design/fields";
import { type SectionProps } from "@/features/design/render/context";
import {
  DesignButton,
  DesignImg,
  designImageSrc,
  DesignLink,
  image,
  list,
  num,
  Paragraphs,
  SectionFrame,
  SectionHeading,
  str,
} from "@/features/design/render/frame";
import { StarRating } from "@/features/reviews/components/star-rating";
import { getShopReviews } from "@/features/storefront/queries";
import { INTL_LOCALE, type Locale } from "@/i18n/core";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  truck: TruckIcon,
  cod: BanknoteIcon,
  returns: RotateCcwIcon,
  shield: ShieldCheckIcon,
  gift: GiftIcon,
  clock: ClockIcon,
  phone: PhoneIcon,
  leaf: LeafIcon,
  star: StarIcon,
  award: AwardIcon,
  heart: HeartIcon,
  sparkles: SparklesIcon,
  store: StoreIcon,
  pin: MapPinIcon,
};

const onBrand = (background: unknown) => background === "brand";

// ------------------------------------------------------------------ content
export function ImageWithTextSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const img = image(s.image);
  return (
    <SectionFrame id={section.id} background={str(s.background)} label={ctx.t(str(s.heading))}>
      <div className={cn("grid items-center gap-8", img && "md:grid-cols-2 md:gap-12")}>
        {img && (
          <DesignImg
            image={img}
            alt=""
            className={cn("aspect-[4/3] w-full rounded-2xl", s.side === "right" && "md:order-last")}
          />
        )}
        <div className="space-y-4">
          {ctx.t(str(s.heading)) && (
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {ctx.t(str(s.heading))}
            </h2>
          )}
          <Paragraphs text={ctx.t(str(s.text))} className="opacity-85" />
          <DesignButton
            shopSlug={ctx.shop.slug}
            label={ctx.t(str(s.buttonLabel))}
            link={s.link}
            variant={onBrand(s.background) ? "secondary" : "default"}
          />
        </div>
      </div>
    </SectionFrame>
  );
}

export function RichTextSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const center = s.align !== "left";
  const Title = ctx.index === 0 ? "h1" : "h2";
  if (!ctx.t(str(s.heading)) && !ctx.t(str(s.text)) && !ctx.t(str(s.eyebrow))) return null;
  return (
    <SectionFrame id={section.id} background={str(s.background)} label={ctx.t(str(s.heading))}>
      <div className={cn("mx-auto max-w-3xl space-y-4", center && "text-center")}>
        {ctx.t(str(s.eyebrow)) && (
          <p className="text-sm font-medium tracking-wide uppercase opacity-70">
            {ctx.t(str(s.eyebrow))}
          </p>
        )}
        {ctx.t(str(s.heading)) && (
          <Title className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {ctx.t(str(s.heading))}
          </Title>
        )}
        <Paragraphs text={ctx.t(str(s.text))} className="text-lg opacity-85" />
        <DesignButton
          shopSlug={ctx.shop.slug}
          label={ctx.t(str(s.buttonLabel))}
          link={s.link}
          variant={onBrand(s.background) ? "secondary" : "default"}
          className="mt-2"
        />
      </div>
    </SectionFrame>
  );
}

export function VideoSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const video = parseVideo(str(s.video));
  if (!video) return null;
  const poster = image(s.poster);
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading)) || ctx.t("Video")}>
      <SectionHeading title={ctx.t(str(s.heading))} />
      <VideoPlayer
        provider={video.provider}
        id={video.id}
        title={ctx.t(str(s.heading)) || ctx.t(str(s.caption)) || ctx.t("Video")}
        poster={poster ? designImageSrc(poster) : null}
      />
      {ctx.t(str(s.caption)) && (
        <p className="mt-3 text-center text-sm text-muted-foreground">{ctx.t(str(s.caption))}</p>
      )}
    </SectionFrame>
  );
}

const GALLERY_RATIO = {
  square: "aspect-square",
  portrait: "aspect-[3/4]",
  landscape: "aspect-[4/3]",
} as const;
const GALLERY_COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

export function GallerySection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const pictures = list(s.images).filter((p) => image(p.image));
  if (pictures.length === 0) return null;
  const ratio = GALLERY_RATIO[s.ratio as keyof typeof GALLERY_RATIO] ?? GALLERY_RATIO.square;
  const columns =
    GALLERY_COLUMNS[num(s.columns, 3) as keyof typeof GALLERY_COLUMNS] ?? GALLERY_COLUMNS[3];
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading)) || ctx.t("Gallery")}>
      <SectionHeading title={ctx.t(str(s.heading))} />
      <ul className={cn("grid grid-cols-2 gap-3", columns)}>
        {pictures.map((p) => {
          const figure = (
            <figure className="space-y-2">
              <DesignImg
                image={image(p.image)!}
                alt={str(p.alt) || ctx.t(str(p.caption))}
                sizes="(min-width: 1024px) 33vw, 50vw"
                className={cn("w-full rounded-2xl", ratio)}
              />
              {ctx.t(str(p.caption)) && (
                <figcaption className="text-sm text-muted-foreground">
                  {ctx.t(str(p.caption))}
                </figcaption>
              )}
            </figure>
          );
          return (
            <li key={str(p.id)}>
              {str(p.link) ? (
                <DesignLink
                  shopSlug={ctx.shop.slug}
                  link={str(p.link)}
                  className="block hover:opacity-90"
                >
                  {figure}
                </DesignLink>
              ) : (
                figure
              )}
            </li>
          );
        })}
      </ul>
    </SectionFrame>
  );
}

export function FaqSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const items = list(s.items).filter((i) => str(i.question));
  if (items.length === 0) return null;
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading)) || ctx.t("Questions and answers")}>
      <div className="mx-auto max-w-3xl">
        <SectionHeading title={ctx.t(str(s.heading))} subtitle={ctx.t(str(s.intro)) || undefined} />
        <Accordion type="single" collapsible className="rounded-2xl border px-5">
          {items.map((item) => (
            <AccordionItem key={str(item.id)} value={str(item.id)}>
              <AccordionTrigger className="text-base">{ctx.t(str(item.question))}</AccordionTrigger>
              <AccordionContent>
                <Paragraphs text={ctx.t(str(item.answer))} className="text-muted-foreground" />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </SectionFrame>
  );
}

// ---------------------------------------------------------------- marketing
const reviewDate = (locale: Locale) =>
  new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

export async function ReviewsSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const reviews = await getShopReviews(ctx.shop.id, num(s.minRating, 4), num(s.count, 3));
  if (reviews.length === 0) return null;
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading)) || ctx.t("Customer reviews")}>
      <SectionHeading title={ctx.t(str(s.heading))} />
      <ul className="grid gap-4 md:grid-cols-3">
        {reviews.map((r, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
            <StarRating value={r.rating} size="md" />
            {r.title && <p className="font-medium">{r.title}</p>}
            <blockquote className="line-clamp-6 text-sm leading-relaxed text-muted-foreground">
              {r.body}
            </blockquote>
            <p className="mt-auto text-sm">
              <span className="font-medium">{r.author}</span>
              <span className="text-muted-foreground">
                {" "}
                · {reviewDate(ctx.t.locale).format(new Date(r.created_at))}
              </span>
            </p>
            <Link
              href={routes.storefrontProduct(ctx.shop.slug, r.product_slug)}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {r.product_title}
            </Link>
          </li>
        ))}
      </ul>
    </SectionFrame>
  );
}

export function PromisesSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const items = list(s.items).filter((i) => str(i.title));
  if (items.length === 0) return null;
  const cards = s.style === "cards";
  return (
    <SectionFrame id={section.id} label={ctx.t("Our promises")}>
      <ul
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          items.length >= 3 && "lg:grid-cols-4",
          items.length === 3 && "lg:grid-cols-3",
          !cards && "rounded-2xl border px-5 py-5 sm:divide-x sm:px-0 lg:gap-0",
        )}
      >
        {items.map((item) => {
          const Icon = ICONS[str(item.icon)] ?? TruckIcon;
          return (
            <li
              key={str(item.id)}
              className={cn(
                "flex items-start gap-3",
                cards ? "rounded-2xl bg-muted/60 p-5" : "sm:px-5",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{ctx.t(str(item.title))}</p>
                {ctx.t(str(item.text)) && (
                  <p className="text-sm text-muted-foreground">{ctx.t(str(item.text))}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </SectionFrame>
  );
}

function hasEnded(endsAt: string) {
  return Date.parse(endsAt) <= Date.now();
}

export function CountdownSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const endsAt = str(s.endsAt);
  // A sale without an end date, or one that's over, shows nothing.
  if (!endsAt || hasEnded(endsAt)) return null;
  return (
    <SectionFrame
      id={section.id}
      background={str(s.background) || "brand"}
      label={ctx.t(str(s.heading))}
    >
      <div className="mx-auto max-w-2xl space-y-5 text-center">
        <div className="space-y-2">
          {ctx.t(str(s.heading)) && (
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {ctx.t(str(s.heading))}
            </h2>
          )}
          {ctx.t(str(s.text)) && <p className="opacity-85">{ctx.t(str(s.text))}</p>}
        </div>
        <Countdown endsAt={endsAt} />
        <DesignButton
          shopSlug={ctx.shop.slug}
          label={ctx.t(str(s.buttonLabel))}
          link={s.link}
          variant={onBrand(s.background ?? "brand") ? "secondary" : "default"}
        />
      </div>
    </SectionFrame>
  );
}

export function NewsletterSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  return (
    <SectionFrame
      id={section.id}
      background={str(s.background)}
      label={ctx.t(str(s.heading)) || ctx.t("Newsletter")}
    >
      <div className="mx-auto max-w-2xl space-y-5 text-center">
        <div className="space-y-2">
          {ctx.t(str(s.heading)) && (
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {ctx.t(str(s.heading))}
            </h2>
          )}
          {ctx.t(str(s.text)) && <p className="opacity-85">{ctx.t(str(s.text))}</p>}
        </div>
        {ctx.shop.live ? (
          <NewsletterForm
            shopSlug={ctx.shop.slug}
            buttonLabel={ctx.t(str(s.buttonLabel))}
            inverted={onBrand(s.background)}
          />
        ) : (
          <p className="text-sm opacity-75">{ctx.t("Sign-ups open when the shop goes live.")}</p>
        )}
      </div>
    </SectionFrame>
  );
}

// -------------------------------------------------------------------- story
export function BrandStorySection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const img = image(s.image);
  const stats = list(s.stats).filter((x) => ctx.t(str(x.value)));
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading)) || ctx.t("Our story")}>
      <div className={cn("grid items-center gap-8", img && "md:grid-cols-2 md:gap-14")}>
        {img && (
          <DesignImg
            image={img}
            alt=""
            className={cn("aspect-[4/5] w-full rounded-3xl", s.side !== "left" && "md:order-last")}
          />
        )}
        <div className="space-y-5">
          {ctx.t(str(s.eyebrow)) && (
            <p className="text-sm font-medium tracking-wide text-primary uppercase">
              {ctx.t(str(s.eyebrow))}
            </p>
          )}
          {ctx.t(str(s.heading)) && (
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {ctx.t(str(s.heading))}
            </h2>
          )}
          <Paragraphs text={ctx.t(str(s.text))} className="text-muted-foreground" />
          {stats.length > 0 && (
            <dl className="grid grid-cols-2 gap-4 pt-2">
              {stats.map((x) => (
                <div key={str(x.id)} className="border-l-2 border-primary pl-4">
                  <dt className="text-sm text-muted-foreground">{ctx.t(str(x.label))}</dt>
                  <dd className="sv-heading order-first text-2xl font-semibold">
                    {ctx.t(str(x.value))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <span className="sr-only">{ctx.shop.name}</span>
        </div>
      </div>
    </SectionFrame>
  );
}

export function LocationsSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const places = list(s.items).filter((p) => ctx.t(str(p.name)) || str(p.address));
  if (places.length === 0 && s.showContact === false) return null;
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading)) || ctx.t("Visit us")}>
      <SectionHeading
        title={ctx.t(str(s.heading))}
        action={
          s.showContact !== false && (
            <Button asChild variant="outline">
              <Link href={routes.storefrontContact(ctx.shop.slug)}>{ctx.t("Contact us")}</Link>
            </Button>
          )
        }
      />
      {places.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((p) => (
            <li key={str(p.id)} className="space-y-3 rounded-2xl border p-5">
              {ctx.t(str(p.name)) && <p className="font-medium">{ctx.t(str(p.name))}</p>}
              {str(p.address) && (
                <p className="flex gap-2 text-sm whitespace-pre-line text-muted-foreground">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {str(p.address)}
                </p>
              )}
              {ctx.t(str(p.hours)) && (
                <p className="flex gap-2 text-sm text-muted-foreground">
                  <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {ctx.t(str(p.hours))}
                </p>
              )}
              {str(p.phone) && (
                <a
                  href={`tel:${str(p.phone).replace(/[^\d+]/g, "")}`}
                  className="flex gap-2 text-sm hover:underline"
                >
                  <PhoneIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {str(p.phone)}
                </a>
              )}
              {str(p.link) && (
                <DesignLink
                  shopSlug={ctx.shop.slug}
                  link={str(p.link)}
                  className="inline-block text-sm font-medium text-primary hover:underline"
                >
                  {ctx.t("Get directions")}
                </DesignLink>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionFrame>
  );
}

export function SocialGridSection({ section, ctx }: SectionProps) {
  const s = section.settings;
  const pictures = list(s.images).filter((p) => image(p.image));
  if (pictures.length === 0) return null;
  const follow = str(s.link) ? (
    <Button asChild variant="outline">
      <DesignLink shopSlug={ctx.shop.slug} link={str(s.link)}>
        {str(s.handle) ? ctx.t("Follow {handle}", { handle: str(s.handle) }) : ctx.t("Follow us")}
      </DesignLink>
    </Button>
  ) : null;
  return (
    <SectionFrame id={section.id} label={ctx.t(str(s.heading)) || ctx.t("Social")}>
      <SectionHeading
        title={ctx.t(str(s.heading))}
        subtitle={ctx.t(str(s.handle)) || undefined}
        action={follow}
      />
      <ul className="grid grid-cols-3 gap-1.5 sm:gap-3">
        {pictures.map((p) => (
          <li key={str(p.id)}>
            <DesignImg
              image={image(p.image)!}
              alt={str(p.alt)}
              sizes="33vw"
              className="aspect-square w-full rounded-xl"
            />
          </li>
        ))}
      </ul>
    </SectionFrame>
  );
}
