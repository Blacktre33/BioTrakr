"use client";

import dynamic from "next/dynamic";
import { Fragment, useEffect, useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTelemetrySnapshot } from "@/lib/hooks/use-telemetry";

const MapContainer = dynamic(async () => (await import("react-leaflet")).MapContainer, {
  ssr: false,
});
const TileLayer = dynamic(async () => (await import("react-leaflet")).TileLayer, {
  ssr: false,
});
const CircleMarker = dynamic(async () => (await import("react-leaflet")).CircleMarker, {
  ssr: false,
});
const Polyline = dynamic(async () => (await import("react-leaflet")).Polyline, {
  ssr: false,
});
const Tooltip = dynamic(async () => (await import("react-leaflet")).Tooltip, {
  ssr: false,
});

const LeafletStyles = () => {
  useEffect(() => {
    void import("leaflet/dist/leaflet.css");
  }, []);
  return null;
};

const DEFAULT_CENTER: [number, number] = [42.3467, -71.0972];

function statusColor(status: string) {
  switch (status) {
    case "in_use":
      return "#16a34a";
    case "maintenance":
      return "#f97316";
    case "retired":
      return "#6b7280";
    default:
      return "#2563eb";
  }
}

export function LocationMap() {
  const { data, isLoading } = useTelemetrySnapshot();

  const mapCenter = useMemo<[number, number]>(() => {
    if (!data || data.length === 0) {
      return DEFAULT_CENTER;
    }

    const first = data[0]?.latest;
    if (!first) {
      return DEFAULT_CENTER;
    }

    return [first.latitude, first.longitude];
  }, [data]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Live Location Preview</CardTitle>
      </CardHeader>
      <CardContent className="h-72 overflow-hidden rounded-lg">
        <LeafletStyles />
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <MapContainer
            center={mapCenter}
            zoom={15}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png"
            />

            {data?.map((telemetry) => {
              const polylinePoints = telemetry.trail
                .map((ping) => [ping.latitude, ping.longitude] as [number, number])
                .reverse();

              return (
                <Fragment key={telemetry.assetId}>
                  {polylinePoints.length > 1 ? (
                    <Polyline
                      positions={polylinePoints}
                      pathOptions={{ color: "#94a3b8", weight: 3, opacity: 0.65 }}
                    />
                  ) : null}

                  <CircleMarker
                    center={[telemetry.latest.latitude, telemetry.latest.longitude]}
                    radius={10}
                    pathOptions={{ color: statusColor(telemetry.status), fillOpacity: 0.4 }}
                  >
                    <Tooltip direction="top">
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold capitalize">{telemetry.assetKey.replace(/-/g, " ")}</p>
                        <p>Status: {telemetry.latest.status.replace(/_/g, " ")}</p>
                        <p>
                          Last seen: {new Date(telemetry.latest.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                </Fragment>
              );
            })}
          </MapContainer>
        )}
      </CardContent>
    </Card>
  );
}
