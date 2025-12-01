/**
 * Example component demonstrating @biotrakr/ui usage
 * This shows how to use design tokens from the BioTrakr UI package
 */

"use client";

import { colorTokens, spacingScale, typographyScale, borderRadius } from "@biotrakr/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function BioTrakrUIExample() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>BioTrakr UI Design Tokens</CardTitle>
        <CardDescription>
          Example usage of @biotrakr/ui design system tokens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Color Tokens */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Color Tokens</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <div
                className="h-12 rounded-md"
                style={{ backgroundColor: colorTokens.brandPrimary }}
              />
              <p className="text-xs text-muted-foreground">brandPrimary</p>
            </div>
            <div className="space-y-1">
              <div
                className="h-12 rounded-md"
                style={{ backgroundColor: colorTokens.brandSecondary }}
              />
              <p className="text-xs text-muted-foreground">brandSecondary</p>
            </div>
            <div className="space-y-1">
              <div
                className="h-12 rounded-md"
                style={{ backgroundColor: colorTokens.success }}
              />
              <p className="text-xs text-muted-foreground">success</p>
            </div>
            <div className="space-y-1">
              <div
                className="h-12 rounded-md"
                style={{ backgroundColor: colorTokens.error }}
              />
              <p className="text-xs text-muted-foreground">error</p>
            </div>
          </div>
        </div>

        {/* Spacing Scale */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Spacing Scale</h3>
          <div className="space-y-2">
            {Object.entries(spacingScale).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <div
                  className="bg-primary rounded"
                  style={{ width: value, height: 20 }}
                />
                <span className="text-xs text-muted-foreground">
                  {key}: {value}px
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Typography Scale */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Typography Scale</h3>
          <div className="space-y-2">
            {Object.entries(typographyScale).map(([key, value]) => (
              <p
                key={key}
                style={{ fontSize: value }}
                className="text-foreground"
              >
                {key}: {value} - The quick brown fox jumps over the lazy dog
              </p>
            ))}
          </div>
        </div>

        {/* Border Radius */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Border Radius</h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(borderRadius).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <div
                  className="w-16 h-16 bg-primary"
                  style={{ borderRadius: value }}
                />
                <p className="text-xs text-muted-foreground text-center">
                  {key}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

