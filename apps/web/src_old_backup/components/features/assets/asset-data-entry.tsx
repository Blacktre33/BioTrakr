"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  Plus,
  X,
  CheckCircle,
  AlertCircle,
  Download,
  ChevronDown,
  ChevronUp,
  Trash2,
  Edit2,
  Save,
} from "lucide-react";
import {
  importAssetsFromExcel,
  exportAssetsToExcel,
  downloadAssetTemplate,
  validateExcelFile,
  type ImportResult,
  type ImportError,
} from "@/lib/api/assets";
import { colorTokens, spacingScale } from "@biotrakr/ui";

// Type definitions
interface AssetFormData {
  assetTag: string;
  serialNumber: string;
  barcode: string;
  assetCategory: string;
  assetType: string;
  manufacturer: string;
  modelNumber: string;
  facilityCode: string;
  departmentCode: string;
  locationCode: string;
  status: string;
  condition: string;
  acquisitionDate: string;
  installationDate: string;
  warrantyExpiry: string;
  purchasePrice: string;
  udi: string;
  lotNumber: string;
  isFdaRegulated: boolean;
  isRtlsTracked: boolean;
  rtlsTagId: string;
  bleBeaconId: string;
  notes: string;
}

// Reference data
const ASSET_CATEGORIES = [
  { value: "diagnostic_imaging", label: "Diagnostic Imaging" },
  { value: "life_support", label: "Life Support" },
  { value: "surgical", label: "Surgical Equipment" },
  { value: "laboratory", label: "Laboratory Equipment" },
  { value: "patient_care", label: "Patient Care" },
  { value: "infrastructure", label: "Infrastructure" },
];

const ASSET_TYPES: Record<
  string,
  Array<{ value: string; label: string }>
> = {
  diagnostic_imaging: [
    { value: "CT_SCAN", label: "CT Scanner" },
    { value: "MRI_SYS", label: "MRI System" },
    { value: "XRAY", label: "X-Ray Unit" },
    { value: "ULTRA", label: "Ultrasound" },
  ],
  life_support: [
    { value: "VENT", label: "Ventilator" },
    { value: "INF_PUMP", label: "Infusion Pump" },
    { value: "PAT_MON", label: "Patient Monitor" },
    { value: "DEFIB", label: "Defibrillator" },
  ],
  surgical: [
    { value: "SURG_ROB", label: "Surgical Robot" },
    { value: "ESU", label: "Electrosurgical Unit" },
    { value: "ANES", label: "Anesthesia Machine" },
  ],
  laboratory: [
    { value: "ANALYZER", label: "Analyzer" },
    { value: "CENTRIF", label: "Centrifuge" },
  ],
  patient_care: [
    { value: "HOSP_BED", label: "Hospital Bed" },
    { value: "WHEELCHAIR", label: "Wheelchair" },
    { value: "STRETCHER", label: "Stretcher" },
  ],
  infrastructure: [],
};

const ASSET_STATUSES = [
  { value: "available", label: "Available" },
  { value: "in_use", label: "In Use" },
  { value: "maintenance", label: "Maintenance" },
  { value: "repair", label: "Repair" },
  { value: "decommissioned", label: "Decommissioned" },
  { value: "quarantine", label: "Quarantine" },
];

const ASSET_CONDITIONS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "critical", label: "Critical" },
];

const initialFormData: AssetFormData = {
  assetTag: "",
  serialNumber: "",
  barcode: "",
  assetCategory: "",
  assetType: "",
  manufacturer: "",
  modelNumber: "",
  facilityCode: "",
  departmentCode: "",
  locationCode: "",
  status: "available",
  condition: "good",
  acquisitionDate: "",
  installationDate: "",
  warrantyExpiry: "",
  purchasePrice: "",
  udi: "",
  lotNumber: "",
  isFdaRegulated: false,
  isRtlsTracked: false,
  rtlsTagId: "",
  bleBeaconId: "",
  notes: "",
};

export default function AssetDataEntry() {
  // State
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("upload");
  const [formData, setFormData] = useState<AssetFormData>(initialFormData);
  const [manualEntries, setManualEntries] = useState<AssetFormData[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        setUploadedFile(file);
        setImportResult(null);
      } else {
        alert("Please upload an Excel file (.xlsx or .xls)");
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!uploadedFile) return;

    setImporting(true);

    try {
      const result = await importAssetsFromExcel(uploadedFile);
      setImportResult(result);
    } catch (error) {
      setImportResult({
        success: false,
        totalRows: 0,
        imported: 0,
        failed: 1,
        errors: [
          {
            row: 0,
            field: "file",
            message:
              error instanceof Error ? error.message : "Failed to process file",
          },
        ],
      });
    } finally {
      setImporting(false);
    }
  };

  // Form handlers
  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      // Reset asset type when category changes
      ...(name === "assetCategory" ? { assetType: "" } : {}),
    }));
  };

  const handleAddEntry = () => {
    // Validate required fields
    if (
      !formData.assetTag ||
      !formData.assetCategory ||
      !formData.assetType ||
      !formData.manufacturer ||
      !formData.modelNumber ||
      !formData.facilityCode
    ) {
      alert("Please fill in all required fields");
      return;
    }

    if (editingIndex !== null) {
      // Update existing entry
      setManualEntries((prev) => {
        const updated = [...prev];
        updated[editingIndex] = formData;
        return updated;
      });
      setEditingIndex(null);
    } else {
      // Add new entry
      setManualEntries((prev) => [...prev, formData]);
    }

    setFormData(initialFormData);
  };

  const handleEditEntry = (index: number) => {
    setFormData(manualEntries[index]);
    setEditingIndex(index);
  };

  const handleDeleteEntry = (index: number) => {
    setManualEntries((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setFormData(initialFormData);
    }
  };

  const handleSubmitAll = async () => {
    if (manualEntries.length === 0) {
      alert("No entries to submit");
      return;
    }

    setImporting(true);

    try {
      // TODO: Implement batch API endpoint for manual entries
      // For now, we'll create a temporary Excel file and import it
      // In production, this should use a dedicated batch endpoint
      alert(
        "Batch submission not yet implemented. Please use Excel import for multiple assets.",
      );
      setSubmitSuccess(false);
    } catch (error) {
      alert("Failed to submit entries");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const blob = await downloadAssetTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "biotrakr_asset_template.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert("Failed to download template");
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-6" style={{ padding: spacingScale.lg }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div style={{ marginBottom: spacingScale.xl }}>
          <h1 className="text-3xl font-bold text-foreground">Asset Data Entry</h1>
          <p className="mt-2 text-muted-foreground" style={{ marginTop: spacingScale.sm }}>
            Add new medical equipment to the BioTrakr system
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-card rounded-lg shadow-md mb-6" style={{ marginBottom: spacingScale.md }}>
          <div className="border-b border-border">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab("upload")}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "upload"
                    ? "border-biotrakr-primary text-biotrakr-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
                style={{ 
                  paddingLeft: spacingScale.md, 
                  paddingRight: spacingScale.md,
                  paddingTop: spacingScale.md,
                  paddingBottom: spacingScale.md,
                }}
              >
                <FileSpreadsheet className="w-4 h-4 inline mr-2" />
                Upload Excel
              </button>
              <button
                onClick={() => setActiveTab("manual")}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "manual"
                    ? "border-biotrakr-primary text-biotrakr-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
                style={{ 
                  paddingLeft: spacingScale.md, 
                  paddingRight: spacingScale.md,
                  paddingTop: spacingScale.md,
                  paddingBottom: spacingScale.md,
                }}
              >
                <Plus className="w-4 h-4 inline mr-2" />
                Manual Entry
              </button>
            </nav>
          </div>

          {/* Upload Tab */}
          {activeTab === "upload" && (
            <div className="p-6">
              {/* Download Template Button */}
              <div className="mb-6 flex justify-end" style={{ marginBottom: spacingScale.md }}>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center px-4 py-2 text-sm font-medium text-biotrakr-primary bg-biotrakr-primary/10 rounded-lg hover:bg-biotrakr-primary/20 transition-colors"
                  style={{ 
                    paddingLeft: spacingScale.md, 
                    paddingRight: spacingScale.md,
                    paddingTop: spacingScale.sm,
                    paddingBottom: spacingScale.sm,
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </button>
              </div>

              {/* Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg text-center transition-colors ${
                  dragActive
                    ? "border-biotrakr-primary bg-biotrakr-primary/10"
                    : "border-border hover:border-biotrakr-primary/50"
                }`}
                style={{ 
                  padding: spacingScale["3xl"],
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {uploadedFile ? (
                  <div className="flex items-center justify-center">
                    <FileSpreadsheet className="w-12 h-12 text-biotrakr-success mr-4" style={{ marginRight: spacingScale.md }} />
                    <div className="text-left">
                      <p className="font-medium text-foreground">
                        {uploadedFile.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(uploadedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setUploadedFile(null);
                        setImportResult(null);
                      }}
                      className="ml-4 p-1 text-muted-foreground hover:text-biotrakr-error transition-colors"
                      style={{ marginLeft: spacingScale.md, padding: spacingScale.xs }}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" style={{ marginBottom: spacingScale.md }} />
                    <p className="text-lg font-medium text-foreground mb-2" style={{ marginBottom: spacingScale.sm }}>
                      Drag and drop your Excel file here
                    </p>
                    <p className="text-sm text-muted-foreground mb-4" style={{ marginBottom: spacingScale.md }}>or click to browse</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-biotrakr-primary text-white rounded-lg hover:opacity-90 transition-opacity"
                      style={{ 
                        paddingLeft: spacingScale.md, 
                        paddingRight: spacingScale.md,
                        paddingTop: spacingScale.sm,
                        paddingBottom: spacingScale.sm,
                      }}
                    >
                      Select File
                    </button>
                  </>
                )}
              </div>

              {/* Import Button */}
              {uploadedFile && !importResult && (
                <div className="mt-6 flex justify-center" style={{ marginTop: spacingScale.md }}>
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="px-6 py-3 bg-biotrakr-success text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-opacity"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.md,
                      paddingBottom: spacingScale.md,
                    }}
                  >
                    {importing ? (
                      <>
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        Import Assets
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Import Results */}
              {importResult && (
                <div
                  className={`mt-6 p-4 rounded-lg ${
                    importResult.success
                      ? "bg-biotrakr-success/10"
                      : "bg-biotrakr-warning/10"
                  }`}
                  style={{ 
                    marginTop: spacingScale.md,
                    padding: spacingScale.md,
                  }}
                >
                  <div className="flex items-start">
                    {importResult.failed === 0 ? (
                      <CheckCircle className="w-6 h-6 text-biotrakr-success mr-3 flex-shrink-0" style={{ marginRight: spacingScale.md }} />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-biotrakr-warning mr-3 flex-shrink-0" style={{ marginRight: spacingScale.md }} />
                    )}
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground">
                        Import{" "}
                        {importResult.failed === 0
                          ? "Successful"
                          : "Completed with Errors"}
                      </h3>
                      <div className="mt-2 text-sm text-muted-foreground" style={{ marginTop: spacingScale.sm }}>
                        <p>Total rows: {importResult.totalRows}</p>
                        <p className="text-biotrakr-success">
                          Imported: {importResult.imported}
                        </p>
                        {importResult.failed > 0 && (
                          <p className="text-biotrakr-error">
                            Failed: {importResult.failed}
                          </p>
                        )}
                      </div>

                      {importResult.errors.length > 0 && (
                        <div className="mt-4" style={{ marginTop: spacingScale.md }}>
                          <h4 className="font-medium text-foreground mb-2" style={{ marginBottom: spacingScale.sm }}>
                            Errors:
                          </h4>
                          <ul className="space-y-1">
                            {importResult.errors.map((error, i) => (
                              <li key={i} className="text-sm text-biotrakr-error">
                                Row {error.row}: {error.field} - {error.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Entry Tab */}
          {activeTab === "manual" && (
            <div className="p-6">
              {/* Success Message */}
              {submitSuccess && (
                <div className="mb-6 p-4 bg-biotrakr-success/10 rounded-lg flex items-center" style={{ marginBottom: spacingScale.md, padding: spacingScale.md }}>
                  <CheckCircle className="w-5 h-5 text-biotrakr-success mr-3" style={{ marginRight: spacingScale.md }} />
                  <span className="text-biotrakr-success font-medium">
                    Assets submitted successfully!
                  </span>
                </div>
              )}

              {/* Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ gap: spacingScale.md }}>
                {/* Required Fields */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Asset Tag <span className="text-biotrakr-error">*</span>
                  </label>
                  <input
                    type="text"
                    name="assetTag"
                    value={formData.assetTag}
                    onChange={handleInputChange}
                    placeholder="BT-2025-001"
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Serial Number
                  </label>
                  <input
                    type="text"
                    name="serialNumber"
                    value={formData.serialNumber}
                    onChange={handleInputChange}
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Asset Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="assetCategory"
                    value={formData.assetCategory}
                    onChange={handleInputChange}
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  >
                    <option value="">Select category</option>
                    {ASSET_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Asset Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="assetType"
                    value={formData.assetType}
                    onChange={handleInputChange}
                    disabled={!formData.assetCategory}
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground disabled:bg-muted disabled:cursor-not-allowed"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  >
                    <option value="">Select type</option>
                    {formData.assetCategory &&
                      ASSET_TYPES[formData.assetCategory]?.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Manufacturer <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={handleInputChange}
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Model Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="modelNumber"
                    value={formData.modelNumber}
                    onChange={handleInputChange}
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Facility Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="facilityCode"
                    value={formData.facilityCode}
                    onChange={handleInputChange}
                    placeholder="FAC-MAIN"
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Department Code
                  </label>
                  <input
                    type="text"
                    name="departmentCode"
                    value={formData.departmentCode}
                    onChange={handleInputChange}
                    placeholder="DEPT-ICU"
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Location Code
                  </label>
                  <input
                    type="text"
                    name="locationCode"
                    value={formData.locationCode}
                    onChange={handleInputChange}
                    placeholder="ICU-101"
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  >
                    {ASSET_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Condition <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="condition"
                    value={formData.condition}
                    onChange={handleInputChange}
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  >
                    {ASSET_CONDITIONS.map((cond) => (
                      <option key={cond.value} value={cond.value}>
                        {cond.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                    Purchase Price ($)
                  </label>
                  <input
                    type="number"
                    name="purchasePrice"
                    value={formData.purchasePrice}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                  />
                </div>
              </div>

              {/* Advanced Fields Toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="mt-6 flex items-center text-sm font-medium text-biotrakr-primary hover:opacity-80 transition-opacity"
                style={{ marginTop: spacingScale.md }}
              >
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 mr-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 mr-1" />
                )}
                {showAdvanced ? "Hide" : "Show"} Advanced Fields
              </button>

              {/* Advanced Fields */}
              {showAdvanced && (
                <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ marginTop: spacingScale.md, paddingTop: spacingScale.md, gap: spacingScale.md }}>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                      Barcode
                    </label>
                    <input
                      type="text"
                      name="barcode"
                      value={formData.barcode}
                      onChange={handleInputChange}
                      className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                      Acquisition Date
                    </label>
                    <input
                      type="date"
                      name="acquisitionDate"
                      value={formData.acquisitionDate}
                      onChange={handleInputChange}
                      className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                      Installation Date
                    </label>
                    <input
                      type="date"
                      name="installationDate"
                      value={formData.installationDate}
                      onChange={handleInputChange}
                      className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                      Warranty Expiry
                    </label>
                    <input
                      type="date"
                      name="warrantyExpiry"
                      value={formData.warrantyExpiry}
                      onChange={handleInputChange}
                      className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                      UDI
                    </label>
                    <input
                      type="text"
                      name="udi"
                      value={formData.udi}
                      onChange={handleInputChange}
                      placeholder="Unique Device Identifier"
                      className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                      Lot Number
                    </label>
                    <input
                      type="text"
                      name="lotNumber"
                      value={formData.lotNumber}
                      onChange={handleInputChange}
                      className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                    />
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        name="isFdaRegulated"
                        checked={formData.isFdaRegulated}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-biotrakr-primary border-input rounded focus:ring-biotrakr-primary"
                        style={{ marginRight: spacingScale.sm }}
                      />
                      <span className="ml-2 text-sm text-foreground">
                        FDA Regulated
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        name="isRtlsTracked"
                        checked={formData.isRtlsTracked}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-biotrakr-primary border-input rounded focus:ring-biotrakr-primary"
                        style={{ marginRight: spacingScale.sm }}
                      />
                      <span className="ml-2 text-sm text-foreground">
                        RTLS Tracked
                      </span>
                    </label>
                  </div>

                  {formData.isRtlsTracked && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                          RTLS Tag ID
                        </label>
                        <input
                          type="text"
                          name="rtlsTagId"
                          value={formData.rtlsTagId}
                          onChange={handleInputChange}
                          className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                          BLE Beacon ID
                        </label>
                        <input
                          type="text"
                          name="bleBeaconId"
                          value={formData.bleBeaconId}
                          onChange={handleInputChange}
                          className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                        />
                      </div>
                    </>
                  )}

                  <div className="lg:col-span-3">
                    <label className="block text-sm font-medium text-foreground mb-1" style={{ marginBottom: spacingScale.xs }}>
                      Notes
                    </label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full border border-input rounded-lg focus:ring-2 focus:ring-biotrakr-primary focus:border-biotrakr-primary bg-background text-foreground"
                    style={{ 
                      paddingLeft: spacingScale.md, 
                      paddingRight: spacingScale.md,
                      paddingTop: spacingScale.sm,
                      paddingBottom: spacingScale.sm,
                    }}
                    />
                  </div>
                </div>
              )}

              {/* Add Entry Button */}
              <div className="mt-6 flex justify-end" style={{ marginTop: spacingScale.md }}>
                <button
                  onClick={handleAddEntry}
                  className="px-4 py-2 bg-biotrakr-primary text-white rounded-lg hover:opacity-90 flex items-center transition-opacity"
                  style={{ 
                    paddingLeft: spacingScale.md, 
                    paddingRight: spacingScale.md,
                    paddingTop: spacingScale.sm,
                    paddingBottom: spacingScale.sm,
                  }}
                >
                  {editingIndex !== null ? (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Update Entry
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Add to List
                    </>
                  )}
                </button>
              </div>

              {/* Entries List */}
              {manualEntries.length > 0 && (
                <div className="mt-8" style={{ marginTop: spacingScale.xl }}>
                  <h3 className="text-lg font-medium text-foreground mb-4" style={{ marginBottom: spacingScale.md }}>
                    Pending Entries ({manualEntries.length})
                  </h3>
                  <div className="bg-muted/30 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                            Asset Tag
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                            Manufacturer
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                            Model
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                            Status
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {manualEntries.map((entry, index) => (
                          <tr
                            key={index}
                            className={
                              editingIndex === index ? "bg-biotrakr-primary/10" : "bg-card"
                            }
                          >
                            <td className="px-4 py-3 text-sm text-foreground" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                              {entry.assetTag}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                              {entry.assetType}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                              {entry.manufacturer}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                              {entry.modelNumber}
                            </td>
                            <td className="px-4 py-3 text-sm" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  entry.status === "available"
                                    ? "bg-biotrakr-success/20 text-biotrakr-success"
                                    : entry.status === "in_use"
                                      ? "bg-biotrakr-info/20 text-biotrakr-info"
                                      : entry.status === "maintenance"
                                        ? "bg-biotrakr-warning/20 text-biotrakr-warning"
                                        : "bg-muted text-muted-foreground"
                                }`}
                                style={{ paddingLeft: spacingScale.sm, paddingRight: spacingScale.sm, paddingTop: spacingScale.xs, paddingBottom: spacingScale.xs }}
                              >
                                {entry.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right" style={{ paddingLeft: spacingScale.md, paddingRight: spacingScale.md, paddingTop: spacingScale.md, paddingBottom: spacingScale.md }}>
                              <button
                                onClick={() => handleEditEntry(index)}
                                className="text-biotrakr-primary hover:opacity-80 mr-3 transition-opacity"
                                style={{ marginRight: spacingScale.md }}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(index)}
                                className="text-biotrakr-error hover:opacity-80 transition-opacity"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Submit All Button */}
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={handleSubmitAll}
                      disabled={importing}
                      className="px-6 py-3 bg-biotrakr-success text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center transition-opacity"
                      style={{ 
                        paddingLeft: spacingScale.md, 
                        paddingRight: spacingScale.md,
                        paddingTop: spacingScale.md,
                        paddingBottom: spacingScale.md,
                      }}
                    >
                      {importing ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Submitting...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5 mr-2" />
                          Submit All ({manualEntries.length})
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

