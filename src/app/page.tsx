import { BoxesIcon, ShieldCheckIcon, StoreIcon, TruckIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { ModeToggle } from "@/components/shared/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site";

const features = [
  {
    icon: StoreIcon,
    title: "Sell anything, in many shops",
    body: "Clothing, electronics, kitchenware, groceries and more: separate storefronts under one organisation.",
  },
  {
    icon: BoxesIcon,
    title: "Inventory that fits the product",
    body: "Count units, track serial/IMEI numbers or manage batches with expiry, across every warehouse.",
  },
  {
    icon: TruckIcon,
    title: "Delivery tracking",
    body: "Every shipment tracked to the doorstep, confirmed by OTP.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Secure by default",
    body: "Email OTP sign-in, roles per shop and row-level security.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <ModeToggle />
          <Button variant="ghost" asChild>
            <Link href={routes.signIn()}>Sign in</Link>
          </Button>
          <Button asChild>
            <Link href={routes.signUp()}>Start free trial</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="max-w-3xl space-y-6 py-20 md:py-28">
          <p className="inline-flex rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
            Commerce OS for brands with more than one shop
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            {siteConfig.description}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Launch storefronts, keep stock in sync across warehouses and give customers live
            delivery tracking.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href={routes.signUp()}>Start 14-day free trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href={routes.signIn()}>Sign in</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <f.icon className="mb-2 size-6 text-primary" aria-hidden="true" />
                <CardTitle>{f.title}</CardTitle>
                <CardDescription>{f.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
