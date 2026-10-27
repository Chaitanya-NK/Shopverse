"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

/** The 6-digit email code field used by checkout and sign-in. */
export function CodeInput({
  id,
  label,
  value,
  onChange,
  onComplete,
  error,
  disabled,
  inputRef,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  error: string | null;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const invalid = Boolean(error);
  const slot = (i: number) => (
    <InputOTPSlot key={i} index={i} className="size-12 text-lg" aria-invalid={invalid} />
  );
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id} className="sr-only">
        {label}
      </FieldLabel>
      <InputOTP
        ref={inputRef}
        id={id}
        maxLength={6}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        disabled={disabled}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        containerClassName="justify-center"
        aria-invalid={invalid}
      >
        <InputOTPGroup>{[0, 1, 2].map(slot)}</InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>{[3, 4, 5].map(slot)}</InputOTPGroup>
      </InputOTP>
      {error && <FieldError className="text-center">{error}</FieldError>}
    </Field>
  );
}
