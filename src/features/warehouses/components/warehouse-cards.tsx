import { MapPinIcon, PencilIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WarehouseFormDialog } from "@/features/warehouses/components/warehouse-form-dialog";
import { type WarehouseSummary } from "@/features/warehouses/queries";
import { formatWarehouseLocation } from "@/features/warehouses/schemas";
import { formatNumber } from "@/lib/format";

type ShopOption = { id: string; name: string };

type WarehouseCardsProps = {
  organizationSlug: string;
  warehouses: WarehouseSummary[];
  shops: ShopOption[];
  canManage: boolean;
};

export function WarehouseCards({
  organizationSlug,
  warehouses,
  shops,
  canManage,
}: WarehouseCardsProps) {
  const shopName = new Map(shops.map((s) => [s.id, s.name]));

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {warehouses.map((warehouse) => {
        const location = formatWarehouseLocation(warehouse.address);
        const linkedShops = warehouse.shopIds
          .map((id) => shopName.get(id))
          .filter((name): name is string => Boolean(name));

        return (
          <Card key={warehouse.id} className={warehouse.isActive ? undefined : "opacity-70"}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {warehouse.name}
                <Badge variant="outline" className="font-mono">
                  {warehouse.code}
                </Badge>
                {!warehouse.isActive && <Badge variant="secondary">Inactive</Badge>}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
                {location || "No address yet"}
              </CardDescription>
              {canManage && (
                <CardAction>
                  <WarehouseFormDialog
                    organizationSlug={organizationSlug}
                    shops={shops}
                    warehouse={warehouse}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Edit ${warehouse.name}`}>
                        <PencilIcon />
                      </Button>
                    }
                  />
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Units" value={formatNumber(warehouse.unitsOnHand)} />
                <Stat label="SKUs" value={formatNumber(warehouse.skusInStock)} />
                <Stat
                  label="Low stock"
                  value={formatNumber(warehouse.lowStockSkus)}
                  tone={warehouse.lowStockSkus > 0 ? "warning" : undefined}
                />
              </dl>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-1.5 border-t text-sm">
              {linkedShops.length > 0 ? (
                <>
                  <span className="mr-1 text-muted-foreground">Fulfils</span>
                  {linkedShops.map((name) => (
                    <Badge key={name} variant="secondary">
                      {name}
                    </Badge>
                  ))}
                </>
              ) : (
                <span className="text-muted-foreground">Not linked to any shop</span>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "warning"
            ? "text-lg font-semibold text-amber-600 tabular-nums dark:text-amber-400"
            : "text-lg font-semibold tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
