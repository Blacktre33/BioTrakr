import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Analytics",
};

export default function AnalyticsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics & Reporting</CardTitle>
        <CardDescription>
          Utilization trends, cost savings, and predictive insights will be surfaced from this view.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          The current scaffold focuses on the asset inventory and dashboard. Analytics widgets will be added
          when data pipelines are ready in a later milestone.
        </p>
      </CardContent>
    </Card>
  );
}
