import { PackageSearchIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Customers land here from a mistyped or old link; don't offer a sign-in. */
export default function TrackingNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageSearchIcon />
        </EmptyMedia>
        <EmptyTitle>We couldn&apos;t find that parcel</EmptyTitle>
        <EmptyDescription>
          Check that you opened the full link from your order message, or contact the shop you
          ordered from.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
