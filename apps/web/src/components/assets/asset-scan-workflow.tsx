"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { toast } from "sonner";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Upload, Camera, X } from "lucide-react";

import { useCreateAssetScanMutation } from "@/lib/hooks/use-asset-scan-logs";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { AssetQrScanner } from "./asset-qr-scanner";

interface AssetScanWorkflowProps {
  onScanRecorded: (assetId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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

export function AssetScanWorkflow({ onScanRecorded, open: controlledOpen, onOpenChange }: AssetScanWorkflowProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const [assetId, setAssetId] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [notes, setNotes] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [scanTimestamp, setScanTimestamp] = useState<Date | null>(null);
  const [scanMode, setScanMode] = useState<'camera' | 'upload'>('camera');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useCreateAssetScanMutation(assetId);

  const resetState = useCallback(() => {
    setAssetId("");
    setQrPayload("");
    setNotes("");
    setLocationHint("");
    setScanTimestamp(null);
    setUploadedImage(null);
    setUploadedImageFile(null);
    setScanMode('camera');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback((nextOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }
    if (!nextOpen) {
      resetState();
    }
  }, [resetState, onOpenChange]);

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
    setUploadedImage(null);
    setUploadedImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image file size must be less than 10MB');
      return;
    }

    setIsProcessingImage(true);
    setUploadedImage(null);
    setUploadedImageFile(file);

    try {
      // Create image URL for preview
      const imageUrl = URL.createObjectURL(file);
      setUploadedImage(imageUrl);

      // Try to detect QR code in the image (optional - don't fail if no QR found)
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = async () => {
        try {
          const reader = new BrowserQRCodeReader();
          const result = await reader.decodeFromImage(img);
          
          if (result) {
            const payload = result.getText();
            setQrPayload(payload);
            setScanTimestamp(new Date());

            const extractedId = extractAssetIdFromPayload(payload);
            if (extractedId) {
              setAssetId(extractedId);
              toast.success('QR code detected from image');
            } else {
              toast.info('QR code detected but asset ID not found. Please enter asset ID manually.');
            }
          } else {
            // No QR code found - that's okay, it's just an equipment photo
            toast.info('No QR code found in image. You can still submit this as an equipment photo for maintenance.');
          }
        } catch (error) {
          // QR detection failed - that's fine, image can still be used
          console.log('QR detection failed (this is okay for equipment photos):', error);
        } finally {
          setIsProcessingImage(false);
        }
      };

      img.onerror = () => {
        toast.error('Failed to load image');
        setIsProcessingImage(false);
        setUploadedImage(null);
        setUploadedImageFile(null);
      };

      img.src = imageUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process image';
      toast.error(message);
      setIsProcessingImage(false);
      setUploadedImage(null);
      setUploadedImageFile(null);
    }
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

    // Convert image to base64 if uploaded (for now, store in notes)
    // In production, you'd upload to a file storage service and store the URL
    let notesWithImage = notes;
    if (uploadedImageFile) {
      try {
        const base64Image = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              resolve(reader.result);
            } else {
              reject(new Error('Failed to convert image to base64'));
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(uploadedImageFile);
        });

        // Append image info to notes
        const imageInfo = `\n\n[Image attached: ${uploadedImageFile.name} (${(uploadedImageFile.size / 1024).toFixed(1)}KB)]`;
        notesWithImage = notes ? notes + imageInfo : imageInfo.trim();
        
        // Store base64 image data (in production, upload to storage and store URL)
        // For now, we'll note that an image was attached
        if (!notesWithImage.includes('[Image attached')) {
          notesWithImage = notesWithImage + imageInfo;
        }
      } catch (error) {
        console.error('Failed to process image:', error);
        toast.warning('Image could not be processed, but scan will still be logged');
      }
    }

    const payload = {
      qrPayload: qrPayload || assetId || 'manual-entry',
      notes: notesWithImage || undefined,
      locationHint: locationHint || undefined,
    };

    try {
      // Persist the scan; React Query will invalidate the asset history for us via the mutation hook.
      await mutation.mutateAsync({ assetId, payload });
      toast.success(uploadedImageFile ? "Scan with equipment photo logged successfully." : "Scan logged successfully.");
      onScanRecorded(assetId);
      handleClose(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to log scan";
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {controlledOpen === undefined && onOpenChange === undefined && (
        <DialogTrigger asChild>
          <Button>Scan Asset QR</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Scan Asset QR Code / Report Issue</DialogTitle>
          <DialogDescription>
            Scan a QR code using your camera, or upload a photo of the equipment to report a maintenance issue. QR codes are detected automatically, but you can also upload equipment photos without QR codes.
          </DialogDescription>
        </DialogHeader>
        
        {/* Mode Toggle */}
        <div className="flex items-center gap-2 p-1 bg-surface-200/30 rounded-lg">
          <Button
            type="button"
            variant={scanMode === 'camera' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setScanMode('camera')}
            leftIcon={<Camera className="w-4 h-4" />}
            className="flex-1"
          >
            Camera
          </Button>
          <Button
            type="button"
            variant={scanMode === 'upload' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => {
              setScanMode('upload');
              fileInputRef.current?.click();
            }}
            leftIcon={<Upload className="w-4 h-4" />}
            className="flex-1"
          >
            Upload Image
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Camera or Image Preview */}
          <div className="md:col-span-1">
            {scanMode === 'camera' ? (
              <AssetQrScanner
                className="w-full"
                onDetected={onDetected}
                onError={(message) => toast.error(message)}
                paused={mutation.isPending || Boolean(scanTimestamp)}
              />
            ) : (
              <div className="space-y-3">
                <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
                  {uploadedImage ? (
                    <>
                      <img 
                        src={uploadedImage} 
                        alt="Uploaded QR code" 
                        className="h-full w-full object-contain"
                      />
                      {isProcessingImage && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                          <p className="text-sm text-white">Processing...</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                      <Upload className="w-12 h-12 text-gray-500" />
                      <p className="text-sm text-gray-400">
                        Upload a photo of the equipment
                      </p>
                      <p className="text-xs text-gray-500">
                        QR codes are detected automatically, or upload any equipment photo for maintenance reporting
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose Image
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {uploadedImage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUploadedImage(null);
                        setUploadedImageFile(null);
                        setQrPayload("");
                        setScanTimestamp(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      leftIcon={<X className="w-4 h-4" />}
                    >
                      Remove Image
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="ml-auto"
                  >
                    {uploadedImage ? 'Change Image' : 'Upload Image'}
                  </Button>
                </div>
              </div>
            )}
          </div>
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
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <p>{scanSummary}</p>
                  <Button type="button" variant="ghost" className="px-0 h-auto" onClick={handleResetCapture}>
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
              <Label htmlFor="notes">
                Notes / Issue Description
                {uploadedImageFile && (
                  <span className="ml-2 text-xs text-primary-400">
                    (Image attached: {uploadedImageFile.name})
                  </span>
                )}
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Describe the issue or maintenance needed. Equipment photo will be attached automatically."
                rows={4}
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

