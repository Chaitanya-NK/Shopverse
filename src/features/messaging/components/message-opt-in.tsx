"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

/** "Send me order updates on WhatsApp", shown at checkout when the shop offers it. */
export function MessageOptIn({
  channel,
  checked,
  onCheckedChange,
}: {
  channel: "whatsapp" | "sms";
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id="message-opt-in"
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
      />
      <span>
        <FieldLabel htmlFor="message-opt-in" className="font-normal">
          Send me order updates on {channel === "whatsapp" ? "WhatsApp" : "SMS"}
        </FieldLabel>
        <FieldDescription>
          Confirmation, shipping and the delivery code, to your mobile number. No marketing.
        </FieldDescription>
      </span>
    </Field>
  );
}
