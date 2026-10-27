/** Must match `otp_length` in supabase/config.toml (and the hosted project setting). */
export const OTP_LENGTH = 6;

/** Minimum wait before the user may request another code (mirrors auth.email.max_frequency). */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/** Must match `otp_expiry` in supabase/config.toml. */
export const OTP_EXPIRY_MINUTES = 10;
