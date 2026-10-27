import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthFormSkeleton } from "@/features/auth/components/auth-form-skeleton";
import { AuthHeader } from "@/features/auth/components/auth-header";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { readReturnTo } from "@/lib/search-params";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <>
      <AuthHeader
        title="Create your account"
        description="Start a 14-day free trial. No card needed — just verify your email."
      />
      <Suspense fallback={<AuthFormSkeleton fields={2} />}>
        <SignUpFormLoader searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignUpFormLoader({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  return <SignUpForm next={await readReturnTo(searchParams)} />;
}
