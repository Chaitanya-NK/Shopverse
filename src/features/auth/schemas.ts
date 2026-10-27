import { z } from "zod";

import { OTP_LENGTH } from "@/features/auth/constants";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(120, "Name is too long");

export const otpSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`);

export const signInSchema = z.object({
  email: emailSchema,
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  next: z.string().optional(),
});

export const verifyOtpSchema = z.object({
  token: otpSchema,
  next: z.string().optional(),
});

export const resendOtpSchema = z.object({});

export type SignInInput = z.input<typeof signInSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;
