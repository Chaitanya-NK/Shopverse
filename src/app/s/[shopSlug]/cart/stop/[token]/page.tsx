import { BellOffIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StopRemindersButton } from "@/features/marketing/components/stop-reminders-button";
import { T } from "@/i18n/client";

export const metadata: Metadata = {
  title: "Cart reminders",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = PageProps<"/s/[shopSlug]/cart/stop/[token]">;

/** From the reminder email. A button, not the link itself, so mail scanners can't unsubscribe people. */
export default function StopRemindersPage({ params }: Props) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellOffIcon className="size-5" aria-hidden />
          <T>Stop cart reminders?</T>
        </CardTitle>
        <CardDescription>
          <T>{"We won't email you about carts you leave in this shop. Order emails still come."}</T>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-9 w-44" />}>
          <Stop params={params} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function Stop({ params }: Pick<Props, "params">) {
  const { shopSlug, token } = await params;
  return <StopRemindersButton shopSlug={shopSlug} token={token} />;
}
