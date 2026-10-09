"use client";

import { useMemo } from "react";
import QRCodeLib from "qrcode";

/**
 * Builds the SVG path for a QR code: one 1×1 square per dark module.
 * Drawn as plain SVG (no canvas, no innerHTML) so it prints sharply at
 * any size.
 */
export function qrPath(text: string): { size: number; d: string } {
  const { modules } = QRCodeLib.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, d };
}

export function QrCode({ text, className, title }: { text: string; className?: string; title?: string }) {
  const { size, d } = useMemo(() => qrPath(text), [text]);
  // Two modules of quiet zone around the code; scanners need some white space.
  return (
    <svg
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? "QR code"}
    >
      <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
