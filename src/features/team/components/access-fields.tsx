"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, type OrgRole } from "@/features/organizations/permissions";
import { ROLE_DESCRIPTIONS, roleHasAllShops } from "@/features/team/schemas";

type AccessFieldsProps = {
  idPrefix: string;
  roles: readonly OrgRole[];
  role: OrgRole;
  onRoleChange: (role: OrgRole) => void;
  allShops: boolean;
  onAllShopsChange: (value: boolean) => void;
  shopIds: string[];
  onShopIdsChange: (ids: string[]) => void;
  shops: { id: string; name: string }[];
  shopError?: string;
};

/** Role picker plus "which shops" — shared by the invite and edit dialogs. */
export function AccessFields(props: AccessFieldsProps) {
  const { idPrefix, roles, role, allShops, shopIds, shops } = props;
  const everyShop = roleHasAllShops(role);

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-role`}>Role</FieldLabel>
        <Select value={role} onValueChange={(v) => props.onRoleChange(v as OrgRole)}>
          <SelectTrigger id={`${idPrefix}-role`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{ROLE_DESCRIPTIONS[role]}</FieldDescription>
      </Field>

      {shops.length > 1 && (
        <FieldSet data-invalid={Boolean(props.shopError) || undefined}>
          <FieldLegend variant="label">Shops</FieldLegend>
          {everyShop ? (
            <FieldDescription>{ROLE_LABELS[role]}s always see every shop.</FieldDescription>
          ) : (
            <div className="grid gap-3">
              <Field orientation="horizontal">
                <Checkbox
                  id={`${idPrefix}-all`}
                  checked={allShops}
                  onCheckedChange={(c) => props.onAllShopsChange(c === true)}
                />
                <FieldLabel htmlFor={`${idPrefix}-all`} className="font-normal">
                  All shops, including ones added later
                </FieldLabel>
              </Field>
              {!allShops && (
                <div className="grid gap-2 border-l pl-4 sm:grid-cols-2">
                  {shops.map((shop) => (
                    <Field key={shop.id} orientation="horizontal">
                      <Checkbox
                        id={`${idPrefix}-shop-${shop.id}`}
                        checked={shopIds.includes(shop.id)}
                        onCheckedChange={(c) =>
                          props.onShopIdsChange(
                            c === true
                              ? [...shopIds, shop.id]
                              : shopIds.filter((id) => id !== shop.id),
                          )
                        }
                      />
                      <FieldLabel htmlFor={`${idPrefix}-shop-${shop.id}`} className="font-normal">
                        {shop.name}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              )}
              {props.shopError && <FieldError>{props.shopError}</FieldError>}
            </div>
          )}
        </FieldSet>
      )}
    </>
  );
}
