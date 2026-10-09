"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";

import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { Button, Card } from "@/components/ui";
import { signOut } from "@/lib/api/client";
import { safeNext } from "@/lib/auth/session";

/**
 * First sign-in with a password an administrator gave out: the person
 * chooses their own before they can use anything else (the API enforces
 * this too).
 */
function ChooseOwnPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <Card className="w-full max-w-md p-8">
      <div className="mb-2 flex items-center gap-3">
        <KeyRound className="h-6 w-6 text-primary-400" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-gray-100">Choose your own password</h1>
      </div>
      <p className="mb-6 text-sm text-gray-400">
        You signed in with a one-time password. Pick a new one that only you know before you continue.
      </p>
      <ChangePasswordForm
        currentLabel="One-time password"
        submitLabel="Save and continue"
        onChanged={() => router.replace(safeNext(searchParams.get("next")) as never)}
      />
      <Button variant="ghost" size="sm" className="mt-4" onClick={() => void signOut()}>
        Sign out instead
      </Button>
    </Card>
  );
}

export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={null}>
        <ChooseOwnPassword />
      </Suspense>
    </main>
  );
}
