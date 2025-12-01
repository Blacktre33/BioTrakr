# MedAsset Pro - Web Frontend

A modern, production-ready Next.js frontend for healthcare asset management with real-time tracking, predictive maintenance, and compliance automation.

## 🎨 Design System

The UI is built with a **medical-tech aesthetic** featuring:

- **Dark mode first** - Optimized for clinical environments and 24/7 operations
- **Glass morphism cards** - Subtle transparency and blur effects
- **Surgical teal & medical blue** - Healthcare-inspired color palette
- **Animated interactions** - Smooth Framer Motion animations

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Blue | `#3374ff` | Actions, links, highlights |
| Accent Teal | `#25a99f` | Secondary actions, success states |
| Critical Red | `#ef4444` | Alerts, errors, critical status |
| Warning Amber | `#f59e0b` | Warnings, maintenance states |
| Success Green | `#22c55e` | Success, operational status |

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0

### Installation

```bash
# Install dependencies
pnpm install

# Download Geist fonts (required) from Vercel
# Place GeistVF.woff and GeistMonoVF.woff in src/app/fonts/

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Main dashboard
│   ├── assets/             # Asset registry
│   ├── maintenance/        # Work orders
│   ├── tracking/           # Real-time RTLS
│   └── ...
├── components/
│   ├── ui/                 # Reusable UI primitives
│   ├── layout/             # Sidebar, Header
│   ├── dashboard/          # Dashboard components
│   ├── assets/             # Asset management
│   └── tracking/           # RTLS map
├── lib/                    # Utilities and mock data
├── stores/                 # Zustand state
└── types/                  # TypeScript definitions
```

## 🧩 Key Features

### Dashboard
- KPI metric cards with trend indicators
- Utilization trend charts
- Asset status distribution
- Department overview
- Active alerts widget
- Upcoming maintenance

### Asset Registry
- Sortable, filterable data table
- Bulk selection and actions
- Health and utilization indicators
- Search and advanced filters

### Real-Time Tracking
- Interactive floor plan map
- Live asset positions
- Zone overlays (ER, ICU, OR)
- Telemetry data panel
- Breadcrumb trails

### Maintenance
- Work order management
- Status-based filtering
- Priority badges
- Quick actions

## 🔧 Technology Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Zustand** - State management
- **React Query** - Data fetching
- **Recharts** - Visualizations
- **Lucide** - Icons

## 📦 Integration

Set `NEXT_PUBLIC_API_URL` to connect to the NestJS backend.

---

Built for BioTrakr healthcare asset management
