import { AlertCircleIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthFormSkeleton } from "@/features/auth/components/auth-form-skeleton";
import { AuthHeader } from "@/features/auth/components/auth-header";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { readReturnTo } from "@/lib/search-params";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <>
      <AuthHeader
        title="Welcome back"
        description="Enter your email and we'll send you a one-time sign-in code."
      />
      {/* searchParams are request data, so the form streams in behind a boundary. */}
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <SignInFormLoader searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SignInFormLoader({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const [next, params] = await Promise.all([readReturnTo(searchParams), searchParams]);
  return (
    <div className="space-y-6">
      {params.error === "link_expired" && (
        <Alert>
          <AlertCircleIcon />
          <AlertDescription>
            That sign-in link has expired or was already used. Enter your email for a new code.
          </AlertDescription>
        </Alert>
      )}
      <SignInForm next={next} />
    </div>
  );
}
