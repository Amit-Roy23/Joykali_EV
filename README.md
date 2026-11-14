# Joykali EV Mobility — Business Management System

A production-grade, full-stack enterprise resource and business management application built for **Joykali EV Mobility**, an Electric Vehicle (EV) dealership business operating in India.

---

## 1. Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript in strict mode
- **Database**: MongoDB with Mongoose ODM (cached connection helper for serverless/Next.js)
- **Auth**: Custom JWT auth with `httpOnly` secure cookies (15-min access token, 7-day refresh token), `bcryptjs` password hashing, account lockout protection
- **RBAC & Scoping**: Granular permissions system with recursive hierarchical data scoping (`getScopeFilter`)
- **Validation**: Shared Zod schemas across client forms and server Route Handlers
- **Styling & UI**: Tailwind CSS (green/teal EV theme), Lucide icons, responsive layout
- **Forms**: React Hook Form + Zod resolver
- **Tables**: TanStack Table with search, sorting, and pagination
- **Data Fetching**: TanStack Query client & Next.js App Router REST API
- **Charts**: Recharts for business metrics and monthly sales trends
- **PDF Generation**: `@react-pdf/renderer` for GST-compliant Tax Invoices and Employee Payslips
- **Bulk ZIP**: `jszip` for bulk ZIP packaging of payslips in an approved payroll run
- **Excel Export**: `exceljs` for Sales Register, Purchase Register, Stock Audit, and Payroll Register
- **Dates & Currency**: `date-fns` (Asia/Kolkata), Indian number format (`₹1,23,456.00`), and Indian number-to-words (`Rupees Twenty-Eight Thousand Only`)
- **Testing**: Vitest unit test suite

---

## 2. Roles, Hierarchy & Permissions

### Role Hierarchy (Low → High):
$$\text{FEC} < \text{ASM} < \text{BUSINESS\_HEAD} < \text{MANAGING\_PARTNER} < \text{ADMIN}$$

- **FEC (Field Executive Consultant)**: Creates sales, views own sales and personal incentive progress, views/downloads own payslips.
- **ASM (Area Sales Manager)**: Oversees a team of FECs, views team sales & leaderboard, receives team override incentives, views team payslips.
- **BUSINESS_HEAD**: Oversees ASMs, monitors multi-district sales and purchases, manages dealers and subordinates, creates incentive scheme drafts, initiates payroll drafts.
- **MANAGING_PARTNER**: Full business visibility, approves incentive schemes, locks payroll runs, cancels sales with audit logs.
- **ADMIN**: Unrestricted system control, settings management, user administration, role-permission matrix configuration, and security audit log.

### Server-Side Data Scoping (`getScopeFilter`)
Every query enforces data isolation on the server:
- An FEC can only view sales they personally closed.
- An ASM automatically sees their direct sales plus all sales closed by FECs in their downline.
- Mid-month reassignment preserves historical attribution: `sale.asmAtSale` records the manager at the exact sale timestamp so past commissions are never retroactively corrupted.
- A user can never create or modify a user of equal or higher hierarchy rank (`canManageRole`).

---

## 3. Project Structure

```
├── scripts/
│   ├── patch-rollup.js         # WebAssembly fallback patch for Windows
│   └── seed.ts                 # Full database seed script
├── src/
│   ├── app/
│   │   ├── (auth)/             # Login and forced password reset screens
│   │   ├── (dashboard)/        # Protected operational portal
│   │   │   ├── sales/          # Invoices, New Sale, Invoice Download
│   │   │   ├── inventory/      # Stock by chassis, models, bulk allocation
│   │   │   ├── purchases/      # Supplier receipts, unit serial inwards
│   │   │   ├── dealers/        # Franchise dealer network & live stock
│   │   │   ├── employees/      # Directory, Org chart hierarchy, profile
│   │   │   ├── schemes/        # Incentive schemes & interactive builder
│   │   │   ├── incentives/     # Employee 'My Incentives' slab progress
│   │   │   ├── payroll/        # Payroll runs, adjustments, payslip PDFs
│   │   │   ├── reports/        # Excel reports hub (sales/purchase/stock)
│   │   │   └── settings/       # Company profile, roles matrix, audit log
│   │   └── api/                # REST API endpoints (validate → authorize → service)
│   ├── components/             # Reusable UI cards, tables, modal, sidebar, topbar
│   ├── lib/
│   │   ├── db.ts               # Mongoose connection & transaction helper
│   │   ├── auth.ts             # JWT sign/verify, password hashing, cookies
│   │   ├── rbac.ts             # Permission check, hierarchy & scope filters
│   │   ├── codeGenerator.ts    # Concurrency-safe atomic MongoDB counters
│   │   ├── money.ts            # Paise/rupee converter, INR formatting, words
│   │   └── audit.ts            # Immutable operational audit logging
│   ├── models/                 # Mongoose schemas with strict indexing
│   ├── services/               # Pure testable business logic
│   │   ├── incentiveEngine.ts  # SLAB, PER_UNIT, TARGET, OVERRIDE engine
│   │   ├── payrollEngine.ts    # Pro-rated LOP, statutory PF/ESI/PT deductions
│   │   ├── salesService.ts     # Sale booking, cancellation & recalculation
│   │   ├── purchaseService.ts  # Procurement & stock inward
│   │   ├── inventoryService.ts # Bulk dealer allocation & movement history
│   │   ├── pdfService.tsx      # React-PDF tax invoices & payslips
│   │   └── reportService.ts    # ExcelJS register builders & dashboards
│   └── validators/             # Shared Zod validation schemas
│   ├── middleware.ts           # Route protection, silent session renewal, mustChangePassword redirect
└── vitest.config.ts            # Test suite runner
```

---

## 4. Core Features & Business Logic

### 4.1 Concurrency-Safe Atomic Code Generation
All business identifiers are generated atomically using MongoDB `findOneAndUpdate` with `$inc`:
- **Employees**: `JKE-FEC-0001`, `JKE-ASM-0001`, `JKE-BH-0001`, `JKE-MP-0001`, `JKE-ADM-0001`
- **Dealers**: `JKD-0001`
- **Sales Invoices**: `JKS/2026-27/0001` (resets every Indian Financial Year 1 Apr – 31 Mar)
- **Purchases**: `JKP/2026-27/0001`
- **Payroll Runs**: `PR-2026-11`
- **Payslips**: `PS/2026-11/JKE-FEC-0001`

### 4.2 Multi-Model Incentive Calculation Engine
The engine (`src/services/incentiveEngine.ts`) supports 5 rule architectures:
1. **PER_UNIT**: Fixed ₹ per vehicle sold, with optional model-specific overrides.
2. **SLAB**: Volume-tiered payouts (e.g. 1–3 units: ₹500/unit, 4–6 units: ₹800/unit, 7+: ₹1200/unit) supporting both **ALL_UNITS** and **INCREMENTAL** modes.
3. **TARGET_BONUS**: Lump-sum bonus upon crossing unit or revenue thresholds.
4. **PERCENTAGE**: Commission % calculated on ex-showroom (ex-GST) sale value.
5. **TEAM_OVERRIDE**: Overrides awarded to Area Sales Managers based on sales closed by their direct reporting FECs.

### 4.3 Automated Payroll & Payslips
- BH or Admin initiates a draft payroll run for a month/year.
- The system snapshots current salary structures, fetches automatic incentive balances from the `IncentiveLedger`, and pro-rates pay for Loss of Pay (LOP) days.
- Calculates statutory deductions (12% PF on basic, ESI if gross wage $\le$ ₹21,000, and ₹200 Professional Tax).
- Allows authorized reviewers to input manual adjustments and TDS deductions.
- Managing Partner / Admin locks the run, freezing all balances permanently.
- Payslips can be downloaded individually or in bulk as a ZIP archive.

---

## Channel, dispatch & control features

| Area | What it does |
| --- | --- |
| **Two-signature approvals** | Orders, incentive schemes, payroll runs, credit-limit changes and salary revisions take effect only after the **Business Head** and then the **Managing Partner** approve (Approvals inbox). Admin can see but never sign. Any payroll edit clears the signatures. |
| **Distributor portal** | Distributors log in (role `DISTRIBUTOR`, code `JKDB-0001`), see only their own credit, statement, orders and deliveries, place orders, and record the **GRN** when a truck arrives. Short-delivered vehicles are credited back automatically (credit note). |
| **Credit limits** | Dealers and distributors have an approved limit and credit days. Exposure = unpaid invoices + open orders + delivery orders in the pipeline + (dealers) consignment stock. Orders over the limit, or with overdue dues, are refused; re-checked at final approval and at dispatch. Payments are recorded on the party ledger. |
| **Warehouse DO → dispatch** | Approved order → Delivery Order → submit → assign a compliant truck + driver → scan/pick chassis (atomically reserved) → loading checklist → tax invoice (distributor) or delivery challan (dealer consignment) → e-way bill → dispatch by a **different person** than the loader → receiver's GRN. Cancelling releases every reservation. |
| **Invoice & e-way bill** | GST invoice/challan PDF with CGST+SGST or IGST by place of supply. E-way bill JSON in the NIC bulk-upload format; the 12-digit EWB number and validity (1 day per 200 km) are recorded and enforced before dispatch. |
| **Fleet documents** | RC, insurance, PUC (not for EVs), fitness, permit, road tax with expiry dates and scans. A truck with any missing/expired paper, on manual hold or inactive is **locked** and cannot be loaded or dispatched; expiring papers are flagged on dashboards. |
| **Channel network (phase 4)** | Four partner tiers with their own logins: **super distributor** (`JKSD-…`) → **distributor** (`JKDB-…`) → **dealer** (`JKD-…`) → **sub dealer** (`JKSB-…`). Each buys from the level above: the company supplies super distributors, independent distributors and company dealers (orders need BH + MP); everyone else orders from its own supplier, who accepts against the credit **it** gave. Sales down the chain are invoiced from the seller's own stock by chassis number, travel until the buyer confirms receipt (shortages are credited back automatically), and post to the seller's own books. Partners also bill retail customers. |
| **Appointments & KYC** | Partners appoint the next level down (a dealer on consignment cannot). New partners stay **pending** until the company verifies GST, PAN and the signed agreement — someone other than the uploader must verify. Security deposits (received / refunded / set off against dues) are tracked per partner. |
| **Territories, targets, chain tree** | Zone → district → area master; super distributors hold districts, one distributor per area. Monthly partner targets with live achievement, ranking and per-unit commission paid as a credit note (company commission needs BH + MP). Business network tree with stock and dues at every level. Account statements download as Excel. |
| **Showrooms** | Company outlets get a showroom login, receive stock from the warehouse on a branch transfer (the sender cannot confirm receipt), bill customers at the counter from their own floor stock only, and see a day closing of bills and collections by payment mode. |
| **HR & attendance (phase 5)** | Staff punch in/out from the phone with a selfie and GPS (office staff must be inside the office radius); biometric machine exports import as punches. Shifts with grace time, duty roster, holiday calendar. Each day is worked out automatically: present / late / half day / absent / missed punch / leave / holiday, late and early minutes, overtime in 30-minute blocks; every third late mark costs half a day. Leave types with balances (pro-rated for new joiners) approved by the reporting manager or HR — never by the applicant. Missed punches are corrected by request + approval. |
| **Money through payroll** | Approved overtime (2× ordinary rate), loss of pay from attendance, reimbursed expense claims and loan / advance instalments all land on the payslip automatically; locking the payroll books the recoveries and marks claims paid. Advances, loans, expense claims (after the manager checks the bill) and full & final settlements need the Business Head and then the Managing Partner. |
| **People records** | Departments, employee documents verified by HR (not by the uploader), printable ID card whose QR opens a public "is this card valid" page, resignation → last working day → F&F (salary days, EL encashment, gratuity after 5 years, notice shortfall, loans) → login closes on the last day. Staff targets and a performance score (sales vs target, attendance, punctuality). HR Manager role. |
| **Staff app & security** | The web app installs on a phone home screen and opens on **My HR** (punch, calendar, leave, claims, roster, holidays, ID card). Sessions sign out after 30 idle minutes. File downloads are limited to people the file belongs to. |
| **Automatic salary** | Enter a monthly gross or annual CTC; basic/HRA/conveyance/special allowance, PF (₹15k ceiling), ESI, WB professional tax, employer cost and take-home are calculated. Revisions are effective-dated and need BH + MP approval; a daily job drafts last month's payroll on the 1st. |

## Deploying

**Vercel (frontend + backend in one project) with MongoDB Atlas:** follow [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md) —
environment variables, Atlas setup, loading data, and the `/api/health` check.

## 5. Getting Started & Setup

### Prerequisites
- Node.js v20+ (v22 recommended) and pnpm
- **MongoDB running as a replica set** (MongoDB Atlas works out of the box). Sales, purchases and payroll use
  multi-document transactions, which MongoDB only supports on a replica set. For a local single-node replica set:
  ```bash
  docker run -d --name joykali-mongo -p 27017:27017 mongo:7 --replSet rs0
  ```
  ```bash
  docker exec joykali-mongo mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
  ```

### 1. Environment
```bash
cp .env.example .env
```
`.env` is git-ignored. For **production** set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to unique random values
of at least 32 characters (e.g. `openssl rand -hex 32`) — the server refuses to issue tokens with the public
development defaults. Set `NEXT_PUBLIC_DEMO_MODE=false` to hide the one-click demo accounts on the login page.

### 2. Install, seed, test, run
```bash
pnpm install
```
```bash
pnpm seed
```
```bash
pnpm test
```
```bash
pnpm dev
```
Open http://localhost:3000.

`pnpm seed` **wipes the database** and rebuilds ~6 months of history ending today (dealers, stock purchases, dealer
allocations, ~310 sales, incentive ledgers, and 5 payroll runs — 4 locked, the latest approved), all generated through
the real service layer so every figure on screen is produced by the same code the app runs.

---

## 6. Demo Accounts

Password for every account: **`Joykali@123`** (login with email or employee code). With
`NEXT_PUBLIC_DEMO_MODE=true` the login page offers one-click sign-in for each role.

| Role | Login | Code | Good for showing |
| :--- | :--- | :--- | :--- |
| Admin | `admin@joykaliev.in` | `JKE-ADM-0001` | Roles & permission matrix, settings, audit log |
| Managing Partner | `mp@joykaliev.in` | `JKE-MP-0001` | Approve the draft scheme, lock the approved payroll |
| Business Head | `bh@joykaliev.in` | `JKE-BH-0001` | Generate this month's payroll, dealers, stock |
| ASM — Kolkata | `asm.kolkata@joykaliev.in` | `JKE-ASM-0002` | Team leaderboard, override earnings |
| ASM — North / South | `asm.north@…`, `asm.south@…` | `JKE-ASM-0001/3` | |
| FEC (top seller) | `fec5@joykaliev.in` | `JKE-FEC-0005` | Record a sale on a phone, watch incentive update |
| FEC 1–12 | `fec1@joykaliev.in` … `fec12@…` | `JKE-FEC-0001…` | |
| HR Manager | `hr@joykaliev.in` | `JKE-HR-0001` | Setup, register Excel, compute a final settlement |
| Showroom (Salt Lake) | `showroom@joykaliev.in` | `JKE-OUT-0001` | Counter bill, receive a transfer, day closing |
| Super distributor | `sd1@joykaliev.in` | `JKSD-0001` | Network view, its Bolpur distributor |
| Distributor | `dist1@joykaliev.in` | `JKDB-0001` | Accept Memari's order, supply it, set targets |
| Dealer | `dealer1@joykaliev.in` | `JKD-0007` | Buy stock, receive the shipment on the road, sell |
| Sub dealer | `subdealer1@joykaliev.in` | `JKSB-0001` | Buys from Memari, retail bill |

### Suggested 5-minute client demo
1. **FEC on a phone** — sign in as Arnab (FEC), tap **+**, pick an E-Rickshaw, fill the customer, confirm. The
   dashboard's incentive and "next milestone" charge bar update immediately.
2. **Managing Partner** — Dashboard → "1 incentive scheme awaiting approval" → approve *Commercial EV Push*. Every FEC
   who sold a commercial vehicle this month gets the per-unit bonus, and any open payroll draft re-prices on its own.
3. **Business Head** — Payroll Runs → run this month's draft → adjust LOP for one person.
4. **Managing Partner** — approve, then lock. Payslips are released; employees see them under **Payslips**.
5. **Admin** — Roles & Access: toggle a permission and show the menu change for that role.
