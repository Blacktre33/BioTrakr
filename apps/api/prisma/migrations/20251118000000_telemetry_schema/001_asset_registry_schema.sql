-- BioTrakr Asset Registry Schema
-- Migration: 001_asset_registry_schema.sql
-- Description: Core asset management tables for medical equipment tracking

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE asset_status AS ENUM (
    'available',
    'in_use',
    'maintenance',
    'repair',
    'decommissioned',
    'retired',
    'lost',
    'quarantine'
);

CREATE TYPE asset_condition AS ENUM (
    'excellent',
    'good',
    'fair',
    'poor',
    'critical',
    'unknown'
);

CREATE TYPE lifecycle_stage AS ENUM (
    'procurement',
    'receiving',
    'installation',
    'commissioning',
    'active',
    'end_of_life',
    'disposal'
);

CREATE TYPE risk_class AS ENUM (
    'class_i',
    'class_ii',
    'class_iii'
);

CREATE TYPE maintenance_type AS ENUM (
    'preventive',
    'corrective',
    'predictive',
    'emergency',
    'calibration',
    'inspection'
);

CREATE TYPE work_order_status AS ENUM (
    'draft',
    'pending',
    'scheduled',
    'in_progress',
    'on_hold',
    'completed',
    'cancelled',
    'failed'
);

CREATE TYPE certification_status AS ENUM (
    'valid',
    'expiring_soon',
    'expired',
    'revoked',
    'pending'
);

-- ============================================================================
-- ORGANIZATION STRUCTURE
-- ============================================================================

CREATE TABLE facilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    cost_center VARCHAR(50),
    parent_department_id UUID REFERENCES departments(id),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(facility_id, code)
);

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) NOT NULL,
    floor VARCHAR(50),
    building VARCHAR(100),
    room VARCHAR(100),
    zone VARCHAR(100),
    location_type VARCHAR(50), -- 'room', 'hallway', 'storage', 'or_suite'
    coordinates JSONB, -- {x, y, z} for floor mapping
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(facility_id, code)
);

-- ============================================================================
-- ASSET CLASSIFICATION
-- ============================================================================

CREATE TABLE asset_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    parent_category_id UUID REFERENCES asset_categories(id),
    default_pm_interval_days INTEGER,
    default_useful_life_years INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE asset_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID NOT NULL REFERENCES asset_categories(id),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    risk_class risk_class NOT NULL DEFAULT 'class_ii',
    requires_calibration BOOLEAN DEFAULT false,
    calibration_interval_days INTEGER,
    pm_interval_days INTEGER,
    useful_life_years INTEGER,
    fda_product_code VARCHAR(10),
    gmdn_code VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE manufacturers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,
    website VARCHAR(255),
    support_phone VARCHAR(50),
    support_email VARCHAR(255),
    address JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE asset_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manufacturer_id UUID NOT NULL REFERENCES manufacturers(id),
    asset_type_id UUID NOT NULL REFERENCES asset_types(id),
    model_number VARCHAR(255) NOT NULL,
    model_name VARCHAR(255),
    description TEXT,
    specifications JSONB DEFAULT '{}',
    documentation_url VARCHAR(500),
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(manufacturer_id, model_number)
);

-- ============================================================================
-- CORE ASSET REGISTRY
-- ============================================================================

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identification
    asset_tag VARCHAR(100) NOT NULL UNIQUE,
    serial_number VARCHAR(255),
    barcode VARCHAR(255),
    
    -- Classification
    asset_model_id UUID NOT NULL REFERENCES asset_models(id),
    asset_type_id UUID NOT NULL REFERENCES asset_types(id),
    category_id UUID NOT NULL REFERENCES asset_categories(id),
    
    -- Location & Assignment
    facility_id UUID NOT NULL REFERENCES facilities(id),
    department_id UUID REFERENCES departments(id),
    current_location_id UUID REFERENCES locations(id),
    assigned_to_user_id UUID, -- Reference to users table
    
    -- Status & Condition
    status asset_status NOT NULL DEFAULT 'available',
    condition asset_condition NOT NULL DEFAULT 'good',
    lifecycle_stage lifecycle_stage NOT NULL DEFAULT 'active',
    health_score INTEGER CHECK (health_score >= 0 AND health_score <= 100),
    
    -- Tracking
    is_tracked_rtls BOOLEAN DEFAULT false,
    rtls_tag_id VARCHAR(100),
    ble_beacon_id VARCHAR(100),
    
    -- Dates
    acquisition_date DATE,
    installation_date DATE,
    warranty_expiration_date DATE,
    last_pm_date DATE,
    next_pm_date DATE,
    last_calibration_date DATE,
    next_calibration_date DATE,
    end_of_life_date DATE,
    disposal_date DATE,
    
    -- Financial
    purchase_price DECIMAL(12, 2),
    current_value DECIMAL(12, 2),
    depreciation_method VARCHAR(50),
    salvage_value DECIMAL(12, 2),
    
    -- Compliance
    udi VARCHAR(100), -- Unique Device Identifier
    lot_number VARCHAR(100),
    is_fda_regulated BOOLEAN DEFAULT false,
    
    -- Operational
    operating_hours DECIMAL(10, 2) DEFAULT 0,
    cycle_count INTEGER DEFAULT 0,
    
    -- Metadata
    custom_fields JSONB DEFAULT '{}',
    notes TEXT,
    
    -- Audit
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft delete
);

-- ============================================================================
-- ASSET LIFECYCLE & HISTORY
-- ============================================================================

CREATE TABLE asset_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    previous_status asset_status,
    new_status asset_status NOT NULL,
    previous_location_id UUID REFERENCES locations(id),
    new_location_id UUID REFERENCES locations(id),
    changed_by UUID,
    reason VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE asset_location_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id),
    facility_id UUID REFERENCES facilities(id),
    department_id UUID REFERENCES departments(id),
    source VARCHAR(50), -- 'manual', 'rtls', 'scan', 'ble'
    confidence DECIMAL(3, 2), -- 0.00 to 1.00
    coordinates JSONB,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    recorded_by UUID
);

-- ============================================================================
-- MAINTENANCE & WORK ORDERS
-- ============================================================================

CREATE TABLE work_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_number VARCHAR(50) NOT NULL UNIQUE,
    asset_id UUID NOT NULL REFERENCES assets(id),
    
    -- Type & Status
    maintenance_type maintenance_type NOT NULL,
    status work_order_status NOT NULL DEFAULT 'draft',
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    
    -- Details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    problem_code VARCHAR(50),
    
    -- Scheduling
    requested_date TIMESTAMPTZ DEFAULT NOW(),
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    
    -- Assignment
    requested_by UUID,
    assigned_to UUID,
    completed_by UUID,
    
    -- Resolution
    resolution_notes TEXT,
    failure_code VARCHAR(50),
    root_cause TEXT,
    
    -- Cost
    estimated_cost DECIMAL(10, 2),
    actual_cost DECIMAL(10, 2),
    labor_hours DECIMAL(6, 2),
    
    -- ML Predictions
    predicted_by_ml BOOLEAN DEFAULT false,
    prediction_confidence DECIMAL(3, 2),
    prediction_model_version VARCHAR(50),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE work_order_parts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    part_number VARCHAR(100) NOT NULL,
    part_name VARCHAR(255),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_cost DECIMAL(10, 2),
    total_cost DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- COMPLIANCE & CERTIFICATIONS
-- ============================================================================

CREATE TABLE certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    certification_type VARCHAR(100) NOT NULL,
    issuing_authority VARCHAR(255),
    certificate_number VARCHAR(100),
    status certification_status NOT NULL DEFAULT 'valid',
    issue_date DATE,
    expiration_date DATE,
    last_inspection_date DATE,
    next_inspection_date DATE,
    inspector_name VARCHAR(255),
    document_url VARCHAR(500),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE compliance_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES facilities(id),
    document_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_url VARCHAR(500),
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    version VARCHAR(50),
    effective_date DATE,
    expiration_date DATE,
    uploaded_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Assets
CREATE INDEX idx_assets_asset_tag ON assets(asset_tag);
CREATE INDEX idx_assets_serial_number ON assets(serial_number);
CREATE INDEX idx_assets_barcode ON assets(barcode);
CREATE INDEX idx_assets_facility ON assets(facility_id);
CREATE INDEX idx_assets_department ON assets(department_id);
CREATE INDEX idx_assets_location ON assets(current_location_id);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_condition ON assets(condition);
CREATE INDEX idx_assets_type ON assets(asset_type_id);
CREATE INDEX idx_assets_model ON assets(asset_model_id);
CREATE INDEX idx_assets_rtls_tag ON assets(rtls_tag_id) WHERE rtls_tag_id IS NOT NULL;
CREATE INDEX idx_assets_next_pm ON assets(next_pm_date) WHERE next_pm_date IS NOT NULL;
CREATE INDEX idx_assets_health_score ON assets(health_score);
CREATE INDEX idx_assets_deleted ON assets(deleted_at) WHERE deleted_at IS NULL;

-- Full text search on assets
CREATE INDEX idx_assets_search ON assets USING gin(
    to_tsvector('english', 
        COALESCE(asset_tag, '') || ' ' || 
        COALESCE(serial_number, '') || ' ' || 
        COALESCE(notes, '')
    )
);

-- Location history
CREATE INDEX idx_location_history_asset ON asset_location_history(asset_id, recorded_at DESC);
CREATE INDEX idx_location_history_time ON asset_location_history(recorded_at DESC);

-- Status history
CREATE INDEX idx_status_history_asset ON asset_status_history(asset_id, created_at DESC);

-- Work orders
CREATE INDEX idx_work_orders_asset ON work_orders(asset_id);
CREATE INDEX idx_work_orders_status ON work_orders(status);
CREATE INDEX idx_work_orders_scheduled ON work_orders(scheduled_start);
CREATE INDEX idx_work_orders_type ON work_orders(maintenance_type);

-- Certifications
CREATE INDEX idx_certifications_asset ON certifications(asset_id);
CREATE INDEX idx_certifications_expiration ON certifications(expiration_date);
CREATE INDEX idx_certifications_status ON certifications(status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_facilities_updated_at
    BEFORE UPDATE ON facilities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_orders_updated_at
    BEFORE UPDATE ON work_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Track asset status changes
CREATE OR REPLACE FUNCTION track_asset_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status OR OLD.current_location_id IS DISTINCT FROM NEW.current_location_id THEN
        INSERT INTO asset_status_history (
            asset_id, 
            previous_status, 
            new_status, 
            previous_location_id, 
            new_location_id,
            changed_by
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            OLD.current_location_id,
            NEW.current_location_id,
            NEW.updated_by
        );
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER track_asset_changes
    AFTER UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION track_asset_status_change();

-- ============================================================================
-- SEED DATA FOR ASSET CATEGORIES
-- ============================================================================

INSERT INTO asset_categories (name, code, description, default_pm_interval_days, default_useful_life_years) VALUES
('Diagnostic Imaging', 'DIAG_IMG', 'Medical imaging equipment', 90, 10),
('Life Support', 'LIFE_SUP', 'Critical life support equipment', 30, 7),
('Surgical Equipment', 'SURGICAL', 'Operating room equipment', 60, 8),
('Laboratory Equipment', 'LAB_EQUIP', 'Laboratory and diagnostic equipment', 90, 10),
('Patient Care', 'PAT_CARE', 'General patient care equipment', 180, 5),
('Infrastructure', 'INFRA', 'Facility infrastructure equipment', 365, 15);

INSERT INTO asset_types (category_id, name, code, risk_class, requires_calibration, calibration_interval_days, pm_interval_days, useful_life_years) VALUES
-- Diagnostic Imaging
((SELECT id FROM asset_categories WHERE code = 'DIAG_IMG'), 'CT Scanner', 'CT_SCAN', 'class_ii', true, 365, 90, 10),
((SELECT id FROM asset_categories WHERE code = 'DIAG_IMG'), 'MRI System', 'MRI_SYS', 'class_ii', true, 365, 90, 12),
((SELECT id FROM asset_categories WHERE code = 'DIAG_IMG'), 'X-Ray Unit', 'XRAY', 'class_ii', true, 365, 90, 8),
((SELECT id FROM asset_categories WHERE code = 'DIAG_IMG'), 'Ultrasound', 'ULTRA', 'class_ii', true, 365, 90, 7),

-- Life Support
((SELECT id FROM asset_categories WHERE code = 'LIFE_SUP'), 'Ventilator', 'VENT', 'class_iii', true, 180, 30, 7),
((SELECT id FROM asset_categories WHERE code = 'LIFE_SUP'), 'Infusion Pump', 'INF_PUMP', 'class_ii', true, 365, 30, 5),
((SELECT id FROM asset_categories WHERE code = 'LIFE_SUP'), 'Patient Monitor', 'PAT_MON', 'class_ii', true, 365, 60, 7),
((SELECT id FROM asset_categories WHERE code = 'LIFE_SUP'), 'Defibrillator', 'DEFIB', 'class_iii', true, 180, 30, 7),

-- Surgical
((SELECT id FROM asset_categories WHERE code = 'SURGICAL'), 'Surgical Robot', 'SURG_ROB', 'class_ii', true, 180, 60, 10),
((SELECT id FROM asset_categories WHERE code = 'SURGICAL'), 'Electrosurgical Unit', 'ESU', 'class_ii', true, 365, 60, 8),
((SELECT id FROM asset_categories WHERE code = 'SURGICAL'), 'Anesthesia Machine', 'ANES', 'class_ii', true, 365, 60, 10),

-- Laboratory
((SELECT id FROM asset_categories WHERE code = 'LAB_EQUIP'), 'Analyzer', 'ANALYZER', 'class_ii', true, 365, 90, 10),
((SELECT id FROM asset_categories WHERE code = 'LAB_EQUIP'), 'Centrifuge', 'CENTRIF', 'class_i', true, 365, 180, 10),

-- Patient Care
((SELECT id FROM asset_categories WHERE code = 'PAT_CARE'), 'Hospital Bed', 'HOSP_BED', 'class_i', false, NULL, 180, 10),
((SELECT id FROM asset_categories WHERE code = 'PAT_CARE'), 'Wheelchair', 'WHEELCHAIR', 'class_i', false, NULL, 365, 5),
((SELECT id FROM asset_categories WHERE code = 'PAT_CARE'), 'Stretcher', 'STRETCHER', 'class_i', false, NULL, 180, 7);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE assets IS 'Core asset registry containing all medical equipment';
COMMENT ON TABLE asset_status_history IS 'Audit trail of asset status and location changes';
COMMENT ON TABLE work_orders IS 'Maintenance work orders for assets';
COMMENT ON COLUMN assets.health_score IS 'ML-predicted health score 0-100, updated by predictive maintenance models';
COMMENT ON COLUMN assets.udi IS 'FDA Unique Device Identifier for medical devices';
COMMENT ON COLUMN work_orders.predicted_by_ml IS 'Whether this work order was automatically generated by ML prediction';
