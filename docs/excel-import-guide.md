# Excel Asset Import Guide

How BioTrakr imports assets from `.xlsx` files, what the importer accepts, and how to fix common errors.

- **UI:** Assets page → **Import** (`apps/web/src/components/assets/asset-excel-import.tsx`)
- **API:** `apps/api/src/pipeline/ingestion/excel-import.controller.ts`
- **Logic:** `apps/api/src/pipeline/ingestion/excel-import.service.ts`

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/assets/import` | Import a `.xlsx` file (multipart field `file`, max 10 MB) |
| `POST` | `/v1/assets/validate` | Validate a file. **Note:** this currently runs the full import, so rows are written to the database |
| `GET` | `/v1/assets/template` | Download a blank template (`biotrakr_asset_template.xlsx`) |
| `GET` | `/v1/assets/export` | Export assets (optional `facilityId` query) |

## Which sheet is read

The importer uses the first sheet it finds from this list, falling back to the workbook's first sheet:

1. `Asset Entry`
2. `Quick Entry`
3. `Assets` (sheet name used by older generated templates)
4. `Sheet1`

Other sheets (`Instructions`, `Reference Data`, `Asset Entry (2)`, …) are ignored. If your data is on a copy such as `Asset Entry (2)`, rename it to `Asset Entry` or move it to the front.

Row 1 must be the header row.

## Columns

Header names match with or without the trailing `*`. A few common alternate headers are also recognised.

| Column | Required? | Accepted alternates | Notes |
|--------|-----------|---------------------|-------|
| Asset Tag* | Either this **or** Serial Number | — | If blank, generated as `AUTO-SN-<serial>` (or `AUTO-BC-<barcode>`) |
| Serial Number | Either this **or** Asset Tag | — | |
| Manufacturer* | **Yes** | — | |
| Model Number* | No | — | Defaults to `Unknown` |
| Facility Code* | No | Facility, Site Code, Site | Defaults to `DEFAULT`; facility is created if it doesn't exist |
| Department Code | No | Department, Dept Code, Dept | Department is created if it doesn't exist |
| Asset Category* | No | Category, Equipment Category | Not yet stored (asset is saved with category `OTHER`) |
| Asset Type* | No | Type, Equipment Type | Not yet stored |
| Status* | No | — | See mapping below; defaults to `AVAILABLE` |
| Condition* | No | — | See mapping below; defaults to `GOOD` |
| Acquisition Date | No | PO or Acquisition Date, Purchase Date, Acquired Date | Must be a valid date; defaults to import date |
| Installation Date | No | — | Unparseable values are left blank |
| Warranty Expiry | No | — | Unparseable values (e.g. `3 years`) are left blank |
| Purchase Price | No | — | See price formats below |
| UDI, RTLS Tag ID, BLE Beacon ID, Notes | No | — | Stored as-is |

Columns marked `*` in the template are still highlighted as recommended, but only **Manufacturer** and **one identifier (Asset Tag or Serial Number)** are enforced.

### Status mapping (case-insensitive; spaces, `-` and `_` are equivalent)

| Input | Stored as |
|-------|-----------|
| available | `AVAILABLE` |
| in use, in_use, inuse, active | `IN_USE` |
| maintenance | `MAINTENANCE` |
| repair, under repair | `REPAIR` |
| decommissioned, retired | `DECOMMISSIONED` |
| quarantine | `QUARANTINE` |
| anything else / blank | `AVAILABLE` |

### Condition mapping (case-insensitive)

| Input | Mapped to |
|-------|-----------|
| excellent, new, like new, very good | `EXCELLENT` |
| good | `GOOD` |
| fair, ok, okay | `FAIR` |
| poor, bad | `POOR` |
| critical | `CRITICAL` |
| unknown | `UNKNOWN` |
| anything else / blank | `GOOD` |

### Purchase price formats

| Input | Stored value |
|-------|--------------|
| `125000` | 125000 |
| `₹1,25,000` / `$1,250` | 125000 / 1250 |
| `1.25 Lakh`, `10 lakh`, `2 lakhs` | 125000, 1000000, 200000 |
| `1 Crore` | 10000000 |
| unparseable text | 0 |

## Rows that are skipped

- Template example rows with Asset Tag `BT-2025-001` or `ASSET-001`
- Rows with no Asset Tag, no Serial Number and no Manufacturer (treated as empty)

## Re-importing

Assets are upserted on Asset Tag. Re-importing the same file updates existing assets (serial, manufacturer, model, status, facility) instead of creating duplicates. Auto-generated tags are derived from the serial number, so they stay stable across re-imports.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `The Excel file appears to be empty…` | The selected sheet has no rows under the header | Check the sheet order/name (see above) |
| `Only the example row was found…` | Only the template sample row is present | Add your assets below it |
| `Found N rows but none with valid Asset Tag values. Columns detected: …` | Headers don't match | Compare the listed columns against the table above |
| `Row N: Asset Tag - Either Asset Tag or Serial Number is required` | Row has neither identifier | Fill in one of them |
| `Row N: Manufacturer - Manufacturer is required` | Manufacturer blank | Fill it in |
| `Row N: Acquisition Date - Invalid date format` | Value like `C3648` (a PO number) in the date column | Move PO numbers to Notes; use `YYYY-MM-DD` |
| `Row N: Purchase Price - Invalid price value` | Negative or non-numeric price | Use a number or a Lakh/Crore value |

The server log records which sheet was used and, when nothing imports, the columns it detected.

## Known limitations

- `/v1/assets/validate` writes to the database (no dry-run yet).
- Error row numbers count from the first data row that passed the empty-row filter, so they may not match Excel row numbers when blank rows are present.
- Asset Category, Asset Type, Condition, Lot Number and the Yes/No flags are read but not yet persisted.
