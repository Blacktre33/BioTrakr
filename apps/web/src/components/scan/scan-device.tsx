"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Search, X } from "lucide-react";

import { AssetQrScanner } from "@/components/assets/asset-qr-scanner";
import { Button, Input, Label, Skeleton } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { useAssetLookup } from "@/lib/hooks/use-asset-lookup";

import { AssetBedsideCard } from "./asset-bedside-card";

/**
 * Scan or type a tag and see at once whether the device is safe to use.
 *
 * The code lives in the URL (/scan?code=…), so a label's QR code can link
 * straight here from a phone's own camera app, and Back returns to the
 * previous device.
 */
export function ScanDevice() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim() || null;

  const [typed, setTyped] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lookup = useAssetLookup(code);
  const role = getSession()?.user.role;

  const open = useCallback(
    (next: string) => {
      const value = next.trim();
      if (!value) return;
      setCameraOn(false);
      setTyped("");
      router.push(`/scan?code=${encodeURIComponent(value)}` as never);
    },
    [router],
  );

  const scanAnother = () => {
    router.push("/scan" as never);
    setTyped("");
    inputRef.current?.focus();
  };

  // Ready for the next tag straight away (keyboard-style barcode scanners type into the focused field).
  useEffect(() => {
    if (!code) inputRef.current?.focus();
  }, [code]);

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          open(typed);
        }}
        className="space-y-2"
        role="search"
      >
        <Label htmlFor="scan-code" className="text-base">
          Scan a device, or type its tag number
        </Label>
        <div className="flex gap-2">
          <Input
            id="scan-code"
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="e.g. BME-2024-001"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="search"
            className="text-lg"
          />
          <Button type="submit" aria-label="Look up" disabled={!typed.trim()}>
            <Search className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="w-full py-4 text-lg"
          onClick={() => setCameraOn((on) => !on)}
          aria-pressed={cameraOn}
        >
          {cameraOn ? (
            <>
              <X className="mr-2 h-5 w-5" aria-hidden="true" /> Close camera
            </>
          ) : (
            <>
              <Camera className="mr-2 h-5 w-5" aria-hidden="true" /> Scan with camera
            </>
          )}
        </Button>
      </form>

      {cameraOn && <AssetQrScanner onDetected={open} />}

      {code && (
        <section aria-live="polite" className="space-y-4">
          {lookup.isPending && (
            <div className="space-y-3" aria-label="Looking up device">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          )}

          {lookup.isError && (
            <div role="alert" className="rounded-2xl border border-critical-500/40 bg-critical-500/10 p-4 text-gray-100">
              <p className="font-semibold">
                {(lookup.error as { statusCode?: number }).statusCode === 404
                  ? "Device not found"
                  : "Couldn't check this device. Do not assume it is safe to use."}
              </p>
              <p className="mt-1 text-sm">{(lookup.error as Error).message}</p>
            </div>
          )}

          {/* After a failed refresh React Query keeps the old data; never show it
              next to the error, it may say "OK to use" for a device that no longer is. */}
          {lookup.data && !lookup.isError && (
            <AssetBedsideCard asset={lookup.data} scannedCode={code} role={role} />
          )}

          <Button type="button" variant="ghost" className="w-full" onClick={scanAnother}>
            Scan another device
          </Button>
        </section>
      )}
    </div>
  );
}
