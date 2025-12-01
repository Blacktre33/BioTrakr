import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MaintenancePlanner } from "@/components/features/maintenance/maintenance-planner";

export const metadata: Metadata = {
  title: "Maintenance",
};

export default function MaintenancePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance Planner</CardTitle>
        <CardDescription>
          Track preventive maintenance work orders, assign technicians, and monitor task progress in real time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MaintenancePlanner />
      </CardContent>
    </Card>
  );
}
