import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export const metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-semibold text-biotrakr-primary">BioTrakr</CardTitle>
          <CardDescription>Sign in to manage your facility&apos;s devices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-4">
            <div className="space-y-2 text-left">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input id="email" type="email" placeholder="biomed@hospital.org" required autoComplete="email" />
            </div>
            <div className="space-y-2 text-left">
              <label className="text-sm font-medium" htmlFor="password">
                Password
              </label>
              <Input id="password" type="password" required autoComplete="current-password" />
            </div>
            <Button className="w-full" type="submit">
              Continue
            </Button>
          </form>
          <Separator />
          <p className="text-center text-sm text-muted-foreground">
            Need access? <Link href="#" className="text-primary underline">Request an account</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
