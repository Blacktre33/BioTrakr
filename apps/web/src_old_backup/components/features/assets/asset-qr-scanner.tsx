"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AssetQrScannerProps {
  className?: string;
  onDetected: (payload: string) => void;
  onError?: (message: string) => void;
  paused?: boolean;
}

export function AssetQrScanner({ className, onDetected, onError, paused }: AssetQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [restartToken, setRestartToken] = useState(0);

  const stopScanner = useCallback(() => {
    // The ZXing controls manage the underlying MediaStream; stopping them releases the camera for other tabs.
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (paused) {
      stopScanner();
      return;
    }

    let isCancelled = false;
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });

    async function start() {
      if (!videoRef.current) {
        return;
      }

      setIsLoading(true);
      setCameraError(null);

      try {
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _error, controls) => {
          if (result && !isCancelled) {
            onDetected(result.getText());
            controlsRef.current = controls;
            controls?.stop();
          }
        });

        if (isCancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setIsLoading(false);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unable to access camera";
        setCameraError(message);
        onError?.(message);
        setIsLoading(false);
      }
    }

    void start();

    return () => {
      isCancelled = true;
      controlsRef.current?.stop();
      reader?.stopAsyncDecode?.();
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDetected, onError, paused, restartToken, stopScanner]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {isLoading ? (
          <div className="absolute inset-0 grid place-items-center bg-background/60">
            <Skeleton className="h-10 w-32" />
          </div>
        ) : null}
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 p-4 text-center text-sm text-destructive">
            <p>{cameraError}</p>
            <Button size="sm" onClick={() => setRestartToken((token) => token + 1)}>
              Retry Camera
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            stopScanner();
            setRestartToken((token) => token + 1);
          }}
        >
          Restart Scanner
        </Button>
      </div>
    </div>
  );
}


