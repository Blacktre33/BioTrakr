"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useCreateAssetMutation } from "@/lib/hooks/use-assets";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";

interface AssetCreateFormProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAssetCreated?: () => void;
}

export function AssetCreateForm({ open, onOpenChange, onAssetCreated }: AssetCreateFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Use mutation hook for creating assets
  const createAssetMutation = useCreateAssetMutation();
  
  // Get initial open state from URL query param
  const isOpen = open ?? searchParams.get('new') === 'true';
  
  const [formData, setFormData] = useState({
    assetTagNumber: '',
    equipmentName: '',
    manufacturer: '',
    modelNumber: '',
    serialNumber: '',
    deviceCategory: 'DIAGNOSTIC_IMAGING',
    assetStatus: 'IN_SERVICE',
    criticalityLevel: 'MEDIUM',
    riskClassification: 'CLASS_II',
    purchaseDate: '',
    purchaseCost: '',
    usefulLifeYears: '10',
    // AMC/CMC Fields
    amcContractNumber: '',
    amcStartDate: '',
    amcEndDate: '',
    amcCostAnnual: '',
    amcInitialCost: '',
    amcYearsPaid: '',
    amcIncreaseAmount: '',
    amcIncreasePercentage: '',
    cmcContractNumber: '',
    cmcStartDate: '',
    cmcEndDate: '',
    cmcCostAnnual: '',
    cmcInitialCost: '',
    cmcYearsPaid: '',
    cmcIncreaseAmount: '',
    cmcIncreasePercentage: '',
    notes: '',
  });

  const handleClose = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      // Remove query param when closing
      const params = new URLSearchParams(searchParams.toString());
      params.delete('new');
      router.replace(`/assets?${params.toString()}`);
    }
    onOpenChange?.(nextOpen);
  }, [searchParams, router, onOpenChange]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      // Calculate AMC increase if both initial and current costs are provided
      const amcInitial = formData.amcInitialCost ? parseFloat(formData.amcInitialCost) : null;
      const amcCurrent = formData.amcCostAnnual ? parseFloat(formData.amcCostAnnual) : null;
      let amcIncreaseAmount = null;
      let amcIncreasePercentage = null;
      if (amcInitial && amcCurrent && amcCurrent > amcInitial) {
        amcIncreaseAmount = amcCurrent - amcInitial;
        amcIncreasePercentage = ((amcIncreaseAmount / amcInitial) * 100).toFixed(2);
      }

      // Calculate CMC increase if both initial and current costs are provided
      const cmcInitial = formData.cmcInitialCost ? parseFloat(formData.cmcInitialCost) : null;
      const cmcCurrent = formData.cmcCostAnnual ? parseFloat(formData.cmcCostAnnual) : null;
      let cmcIncreaseAmount = null;
      let cmcIncreasePercentage = null;
      if (cmcInitial && cmcCurrent && cmcCurrent > cmcInitial) {
        cmcIncreaseAmount = cmcCurrent - cmcInitial;
        cmcIncreasePercentage = ((cmcIncreaseAmount / cmcInitial) * 100).toFixed(2);
      }

      // TODO: These should come from user context/auth in production
      // For now, using placeholder UUIDs that match the backend mock user ID pattern
      const MOCK_ORG_ID = '00000000-0000-0000-0000-000000000001';
      const MOCK_FACILITY_ID = '00000000-0000-0000-0000-000000000002';
      const MOCK_USER_ID = '00000000-0000-0000-0000-000000000000';
      const MOCK_DEPT_ID = '00000000-0000-0000-0000-000000000003';

      const payload: any = {
        assetTagNumber: formData.assetTagNumber,
        equipmentName: formData.equipmentName,
        manufacturer: formData.manufacturer,
        modelNumber: formData.modelNumber,
        serialNumber: formData.serialNumber || undefined,
        deviceCategory: formData.deviceCategory,
        assetStatus: formData.assetStatus,
        criticalityLevel: formData.criticalityLevel,
        riskClassification: formData.riskClassification,
        purchaseDate: formData.purchaseDate || undefined,
        purchaseCost: formData.purchaseCost ? parseFloat(formData.purchaseCost) : undefined,
        usefulLifeYears: parseInt(formData.usefulLifeYears, 10),
        // Required fields - should come from auth/user context
        organizationId: MOCK_ORG_ID,
        currentFacilityId: MOCK_FACILITY_ID,
        primaryCustodianId: MOCK_USER_ID,
        custodianDepartmentId: MOCK_DEPT_ID,
        // AMC Fields
        amcContractNumber: formData.amcContractNumber || undefined,
        amcStartDate: formData.amcStartDate || undefined,
        amcEndDate: formData.amcEndDate || undefined,
        amcCostAnnual: amcCurrent || undefined,
        amcInitialCost: amcInitial || undefined,
        amcYearsPaid: formData.amcYearsPaid ? parseInt(formData.amcYearsPaid, 10) : undefined,
        amcIncreaseAmount: amcIncreaseAmount || undefined,
        amcIncreasePercentage: amcIncreasePercentage ? parseFloat(amcIncreasePercentage) : undefined,
        // CMC Fields
        cmcContractNumber: formData.cmcContractNumber || undefined,
        cmcStartDate: formData.cmcStartDate || undefined,
        cmcEndDate: formData.cmcEndDate || undefined,
        cmcCostAnnual: cmcCurrent || undefined,
        cmcInitialCost: cmcInitial || undefined,
        cmcYearsPaid: formData.cmcYearsPaid ? parseInt(formData.cmcYearsPaid, 10) : undefined,
        cmcIncreaseAmount: cmcIncreaseAmount || undefined,
        cmcIncreasePercentage: cmcIncreasePercentage ? parseFloat(cmcIncreasePercentage) : undefined,
        notes: formData.notes || undefined,
      };

      await createAssetMutation.mutateAsync(payload);
      
      toast.success('Asset created successfully!');
      handleClose(false);
      
      // Reset form
      setFormData({
        assetTagNumber: '',
        equipmentName: '',
        manufacturer: '',
        modelNumber: '',
        serialNumber: '',
        deviceCategory: 'DIAGNOSTIC_IMAGING',
        assetStatus: 'IN_SERVICE',
        criticalityLevel: 'MEDIUM',
        riskClassification: 'CLASS_II',
        purchaseDate: '',
        purchaseCost: '',
        usefulLifeYears: '10',
        amcContractNumber: '',
        amcStartDate: '',
        amcEndDate: '',
        amcCostAnnual: '',
        amcInitialCost: '',
        amcYearsPaid: '',
        amcIncreaseAmount: '',
        amcIncreasePercentage: '',
        cmcContractNumber: '',
        cmcStartDate: '',
        cmcEndDate: '',
        cmcCostAnnual: '',
        cmcInitialCost: '',
        cmcYearsPaid: '',
        cmcIncreaseAmount: '',
        cmcIncreasePercentage: '',
        notes: '',
      });

      onAssetCreated?.();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to create asset';
      toast.error(message);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Asset</DialogTitle>
          <DialogDescription>
            Add a new medical device asset to your inventory. Fill in the required information below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assetTagNumber">Asset Tag Number *</Label>
              <Input
                id="assetTagNumber"
                value={formData.assetTagNumber}
                onChange={(e) => setFormData({ ...formData, assetTagNumber: e.target.value })}
                placeholder="e.g. BME-2024-001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="equipmentName">Equipment Name *</Label>
              <Input
                id="equipmentName"
                value={formData.equipmentName}
                onChange={(e) => setFormData({ ...formData, equipmentName: e.target.value })}
                placeholder="e.g. GE Optima MR360"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer *</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                placeholder="e.g. General Electric"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="modelNumber">Model Number *</Label>
              <Input
                id="modelNumber"
                value={formData.modelNumber}
                onChange={(e) => setFormData({ ...formData, modelNumber: e.target.value })}
                placeholder="e.g. Optima MR360"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial Number</Label>
              <Input
                id="serialNumber"
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                placeholder="e.g. SN123456"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deviceCategory">Device Category *</Label>
              <select
                id="deviceCategory"
                value={formData.deviceCategory}
                onChange={(e) => setFormData({ ...formData, deviceCategory: e.target.value })}
                className="w-full px-4 py-3 bg-surface-200/50 border border-white/5 rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                required
              >
                <option value="DIAGNOSTIC_IMAGING">Diagnostic Imaging</option>
                <option value="PATIENT_MONITORING">Patient Monitoring</option>
                <option value="THERAPEUTIC_EQUIPMENT">Therapeutic Equipment</option>
                <option value="LABORATORY_EQUIPMENT">Laboratory Equipment</option>
                <option value="SURGICAL_EQUIPMENT">Surgical Equipment</option>
                <option value="SUPPORT_EQUIPMENT">Support Equipment</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assetStatus">Status *</Label>
              <select
                id="assetStatus"
                value={formData.assetStatus}
                onChange={(e) => setFormData({ ...formData, assetStatus: e.target.value })}
                className="w-full px-4 py-3 bg-surface-200/50 border border-white/5 rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                required
              >
                <option value="IN_SERVICE">In Service</option>
                <option value="OUT_OF_SERVICE">Out of Service</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="RETIRED">Retired</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="criticalityLevel">Criticality Level *</Label>
              <select
                id="criticalityLevel"
                value={formData.criticalityLevel}
                onChange={(e) => setFormData({ ...formData, criticalityLevel: e.target.value })}
                className="w-full px-4 py-3 bg-surface-200/50 border border-white/5 rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                required
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="riskClassification">Risk Classification *</Label>
              <select
                id="riskClassification"
                value={formData.riskClassification}
                onChange={(e) => setFormData({ ...formData, riskClassification: e.target.value })}
                className="w-full px-4 py-3 bg-surface-200/50 border border-white/5 rounded-xl text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                required
              >
                <option value="CLASS_I">Class I</option>
                <option value="CLASS_II">Class II</option>
                <option value="CLASS_III">Class III</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="usefulLifeYears">Useful Life (Years) *</Label>
              <Input
                id="usefulLifeYears"
                type="number"
                value={formData.usefulLifeYears}
                onChange={(e) => setFormData({ ...formData, usefulLifeYears: e.target.value })}
                placeholder="10"
                min="1"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="purchaseDate">Purchase Date</Label>
              <Input
                id="purchaseDate"
                type="date"
                value={formData.purchaseDate}
                onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchaseCost">Purchase Cost (₹)</Label>
              <Input
                id="purchaseCost"
                type="number"
                step="0.01"
                value={formData.purchaseCost}
                onChange={(e) => setFormData({ ...formData, purchaseCost: e.target.value })}
                placeholder="0.00"
                min="0"
              />
            </div>
          </div>

          {/* AMC/CMC Section */}
          <div className="border-t border-white/10 pt-6 space-y-6">
            <h3 className="text-lg font-semibold text-white">AMC/CMC Contract Information</h3>
            
            {/* AMC Section */}
            <div className="space-y-4 p-4 bg-surface-200/20 rounded-xl">
              <h4 className="font-medium text-white">Annual Maintenance Contract (AMC)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amcContractNumber">AMC Contract Number</Label>
                  <Input
                    id="amcContractNumber"
                    value={formData.amcContractNumber}
                    onChange={(e) => setFormData({ ...formData, amcContractNumber: e.target.value })}
                    placeholder="e.g. AMC-2024-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amcCostAnnual">Current Annual AMC Cost (₹)</Label>
                  <Input
                    id="amcCostAnnual"
                    type="number"
                    step="0.01"
                    value={formData.amcCostAnnual}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setFormData({ ...formData, amcCostAnnual: newValue });
                      // Auto-calculate increase if initial cost exists
                      if (formData.amcInitialCost && newValue) {
                        const initial = parseFloat(formData.amcInitialCost);
                        const current = parseFloat(newValue);
                        if (current > initial) {
                          const increase = current - initial;
                          const percentage = ((increase / initial) * 100).toFixed(2);
                          setFormData(prev => ({
                            ...prev,
                            amcCostAnnual: newValue,
                            amcIncreaseAmount: increase.toFixed(2),
                            amcIncreasePercentage: percentage,
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            amcCostAnnual: newValue,
                            amcIncreaseAmount: '',
                            amcIncreasePercentage: '',
                          }));
                        }
                      }
                    }}
                    placeholder="0.00"
                    min="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amcInitialCost">Initial AMC Cost (₹)</Label>
                  <Input
                    id="amcInitialCost"
                    type="number"
                    step="0.01"
                    value={formData.amcInitialCost}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setFormData({ ...formData, amcInitialCost: newValue });
                      // Auto-calculate increase if current cost exists
                      if (formData.amcCostAnnual && newValue) {
                        const initial = parseFloat(newValue);
                        const current = parseFloat(formData.amcCostAnnual);
                        if (current > initial) {
                          const increase = current - initial;
                          const percentage = ((increase / initial) * 100).toFixed(2);
                          setFormData(prev => ({
                            ...prev,
                            amcInitialCost: newValue,
                            amcIncreaseAmount: increase.toFixed(2),
                            amcIncreasePercentage: percentage,
                          }));
                        }
                      }
                    }}
                    placeholder="0.00"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amcYearsPaid">Years Paid</Label>
                  <Input
                    id="amcYearsPaid"
                    type="number"
                    value={formData.amcYearsPaid}
                    onChange={(e) => setFormData({ ...formData, amcYearsPaid: e.target.value })}
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
              {(formData.amcIncreaseAmount || formData.amcIncreasePercentage) && (
                <div className="p-3 bg-primary-500/10 rounded-lg border border-primary-500/20">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium">Increase:</span> ₹{formData.amcIncreaseAmount || '0.00'} 
                    {formData.amcIncreasePercentage && (
                      <span> ({formData.amcIncreasePercentage}%)</span>
                    )}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amcStartDate">AMC Start Date</Label>
                  <Input
                    id="amcStartDate"
                    type="date"
                    value={formData.amcStartDate}
                    onChange={(e) => setFormData({ ...formData, amcStartDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amcEndDate">AMC End Date</Label>
                  <Input
                    id="amcEndDate"
                    type="date"
                    value={formData.amcEndDate}
                    onChange={(e) => setFormData({ ...formData, amcEndDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* CMC Section */}
            <div className="space-y-4 p-4 bg-surface-200/20 rounded-xl">
              <h4 className="font-medium text-white">Comprehensive Maintenance Contract (CMC)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cmcContractNumber">CMC Contract Number</Label>
                  <Input
                    id="cmcContractNumber"
                    value={formData.cmcContractNumber}
                    onChange={(e) => setFormData({ ...formData, cmcContractNumber: e.target.value })}
                    placeholder="e.g. CMC-2024-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cmcCostAnnual">Current Annual CMC Cost (₹)</Label>
                  <Input
                    id="cmcCostAnnual"
                    type="number"
                    step="0.01"
                    value={formData.cmcCostAnnual}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setFormData({ ...formData, cmcCostAnnual: newValue });
                      // Auto-calculate increase if initial cost exists
                      if (formData.cmcInitialCost && newValue) {
                        const initial = parseFloat(formData.cmcInitialCost);
                        const current = parseFloat(newValue);
                        if (current > initial) {
                          const increase = current - initial;
                          const percentage = ((increase / initial) * 100).toFixed(2);
                          setFormData(prev => ({
                            ...prev,
                            cmcCostAnnual: newValue,
                            cmcIncreaseAmount: increase.toFixed(2),
                            cmcIncreasePercentage: percentage,
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            cmcCostAnnual: newValue,
                            cmcIncreaseAmount: '',
                            cmcIncreasePercentage: '',
                          }));
                        }
                      }
                    }}
                    placeholder="0.00"
                    min="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cmcInitialCost">Initial CMC Cost (₹)</Label>
                  <Input
                    id="cmcInitialCost"
                    type="number"
                    step="0.01"
                    value={formData.cmcInitialCost}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setFormData({ ...formData, cmcInitialCost: newValue });
                      // Auto-calculate increase if current cost exists
                      if (formData.cmcCostAnnual && newValue) {
                        const initial = parseFloat(newValue);
                        const current = parseFloat(formData.cmcCostAnnual);
                        if (current > initial) {
                          const increase = current - initial;
                          const percentage = ((increase / initial) * 100).toFixed(2);
                          setFormData(prev => ({
                            ...prev,
                            cmcInitialCost: newValue,
                            cmcIncreaseAmount: increase.toFixed(2),
                            cmcIncreasePercentage: percentage,
                          }));
                        }
                      }
                    }}
                    placeholder="0.00"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cmcYearsPaid">Years Paid</Label>
                  <Input
                    id="cmcYearsPaid"
                    type="number"
                    value={formData.cmcYearsPaid}
                    onChange={(e) => setFormData({ ...formData, cmcYearsPaid: e.target.value })}
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
              {(formData.cmcIncreaseAmount || formData.cmcIncreasePercentage) && (
                <div className="p-3 bg-primary-500/10 rounded-lg border border-primary-500/20">
                  <p className="text-sm text-gray-300">
                    <span className="font-medium">Increase:</span> ₹{formData.cmcIncreaseAmount || '0.00'} 
                    {formData.cmcIncreasePercentage && (
                      <span> ({formData.cmcIncreasePercentage}%)</span>
                    )}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cmcStartDate">CMC Start Date</Label>
                  <Input
                    id="cmcStartDate"
                    type="date"
                    value={formData.cmcStartDate}
                    onChange={(e) => setFormData({ ...formData, cmcStartDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cmcEndDate">CMC End Date</Label>
                  <Input
                    id="cmcEndDate"
                    type="date"
                    value={formData.cmcEndDate}
                    onChange={(e) => setFormData({ ...formData, cmcEndDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this asset..."
              rows={3}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={createAssetMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createAssetMutation.isPending}>
              {createAssetMutation.isPending ? 'Creating...' : 'Create Asset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

