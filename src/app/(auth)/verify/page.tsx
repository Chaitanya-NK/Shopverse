import { MailIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { routes } from "@/config/routes";
import { AuthFormSkeleton } from "@/features/auth/components/auth-form-skeleton";
import { AuthHeader } from "@/features/auth/components/auth-header";
import { VerifyOtpForm } from "@/features/auth/components/verify-otp-form";
import { OTP_EXPIRY_MINUTES } from "@/features/auth/constants";
import { getPendingVerification } from "@/features/auth/queries";
import { readReturnTo } from "@/lib/search-params";

export const metadata: Metadata = { title: "Check your email" };

export default function VerifyPage({ searchParams }: PageProps<"/verify">) {
  return (
    <Suspense fallback={<AuthFormSkeleton fields={1} />}>
      <VerifyContent searchParams={searchParams} />
    </Suspense>
  );
}

async function VerifyContent({ searchParams }: Pick<PageProps<"/verify">, "searchParams">) {
  const [pending, next] = await Promise.all([getPendingVerification(), readReturnTo(searchParams)]);

  if (!pending) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>Your code has expired</EmptyTitle>
          <EmptyDescription>
            For your security, verification codes last {OTP_EXPIRY_MINUTES} minutes.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href={routes.signIn(next)}>Request a new code</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <>
      <AuthHeader
        title="Check your inbox"
        description={
          <>
            If an account exists for{" "}
            <span className="font-medium text-foreground">{pending.maskedEmail}</span>, we&apos;ve
            sent a 6-digit code. Enter it below or tap the link in the email. It expires in
            {OTP_EXPIRY_MINUTES} minutes.
          </>
        }
      />
      <VerifyOtpForm next={next} />
    </>
  );
}
