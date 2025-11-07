"use client";

import { useCallback, useMemo, useState } from "react";

import { toast } from "sonner";

import { useCreateAssetScanMutation } from "@/lib/hooks/use-asset-scan-logs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssetQrScanner } from "./asset-qr-scanner";

interface AssetScanWorkflowProps {
  onScanRecorded: (assetId: string) => void;
}

export const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;

export function extractAssetIdFromPayload(payload: string): string | null {
  if (!payload) return null;

  try {
    const potentialUrl = new URL(payload);
    if (potentialUrl.pathname) {
      const segments = potentialUrl.pathname.split("/").filter(Boolean);
      const maybeId = segments[segments.length - 1];
      if (maybeId && UUID_REGEX.test(maybeId)) {
        return maybeId;
      }
    }
  } catch (error) {
    // The payload is not a fully qualified URL; fall through to regex detection.
  }

  const regexMatch = payload.match(UUID_REGEX);
  return regexMatch ? regexMatch[0] : null;
}

export function AssetScanWorkflow({ onScanRecorded }: AssetScanWorkflowProps) {
  const [open, setOpen] = useState(false);
  const [assetId, setAssetId] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [notes, setNotes] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [scanTimestamp, setScanTimestamp] = useState<Date | null>(null);

  const mutation = useCreateAssetScanMutation(assetId);

  const resetState = useCallback(() => {
    setAssetId("");
    setQrPayload("");
    setNotes("");
    setLocationHint("");
    setScanTimestamp(null);
  }, []);

  const handleClose = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  }, [resetState]);

  const onDetected = useCallback((payload: string) => {
    setQrPayload(payload);
    setScanTimestamp(new Date());

    const extractedId = extractAssetIdFromPayload(payload);
    if (extractedId) {
      setAssetId(extractedId);
    } else {
      toast.warning("QR payload captured, but the asset ID could not be inferred. Please enter it manually.");
    }
  }, []);

  const handleResetCapture = useCallback(() => {
    setQrPayload("");
    setScanTimestamp(null);
  }, []);

  const scanSummary = useMemo(() => {
    if (!scanTimestamp) return null;
    return `Last capture ${scanTimestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }, [scanTimestamp]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!assetId) {
      toast.error("Please provide a valid asset ID before logging the scan.");
      return;
    }

    const payload = {
      qrPayload: qrPayload || assetId,
      notes: notes || undefined,
      locationHint: locationHint || undefined,
    };

    try {
      // Persist the scan; React Query will invalidate the asset history for us via the mutation hook.
      await mutation.mutateAsync({ assetId, payload });
      toast.success("Scan logged successfully.");
      onScanRecorded(assetId);
      handleClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to log scan";
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button>Scan Asset QR</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Scan Asset QR Code</DialogTitle>
          <DialogDescription>
            Position the asset QR code in front of the camera. Once captured, confirm or adjust the asset details and add optional notes before submitting.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <AssetQrScanner
            className="md:col-span-1"
            onDetected={onDetected}
            onError={(message) => toast.error(message)}
            paused={mutation.isPending || Boolean(scanTimestamp)}
          />
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="asset-id">Asset ID</Label>
              <Input
                id="asset-id"
                value={assetId}
                onChange={(event) => setAssetId(event.target.value)}
                placeholder="e.g. 0f3d67ef-4a15-4f9b-92d4-2211f86af5c8"
                required
              />
              {scanSummary ? (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <p>{scanSummary}</p>
                  <Button type="button" variant="link" className="px-0" onClick={handleResetCapture}>
                    Capture again
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-payload">QR Payload (raw)</Label>
              <Textarea
                id="qr-payload"
                value={qrPayload}
                onChange={(event) => setQrPayload(event.target.value)}
                placeholder="Payload decoded from the QR code"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location-hint">Location Hint</Label>
              <Input
                id="location-hint"
                value={locationHint}
                onChange={(event) => setLocationHint(event.target.value)}
                placeholder="Room, floor, or area"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes captured during the scan"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Log Scan"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}


