# Database Architecture & Workflow Guide (`db_workflow.md`)
### Siddhi Patient-Doctor Assistant — Schema-Per-Clinic Multi-Tenant Architecture

---

## 1. Executive Summary & Core Principles

The **Siddhi Patient-Doctor Assistant** platform is built on an enterprise-grade **Schema-Per-Clinic Multi-Tenant Architecture** in PostgreSQL. In this design:
- **Clinic = Tenant**: Each registered clinic (doctor / medical practice) operates as an independent tenant.
- **Physical Schema Isolation**: Every clinic receives its own dedicated PostgreSQL schema (e.g., `clinic_default`, `clinic_apollo`, `clinic_citycare`).
- **No Hardcoded Domain Defaults**: Database table definitions (DDL) and SQLAlchemy models contain **zero hardcoded domain defaults** (such as sample doctor names, dummy phone numbers, or fixed clinic addresses). Columns are generic, normalized, and strictly populated through explicit runtime API calls or verified seed services.
- **Granular Screen & Action RBAC**: User permissions are stored as a JSON action matrix (`view`, `create`, `edit`, `delete`) per screen, allowing Doctors (Clinic Admins) to delegate restricted access to Front Desk receptionists.

---

## 2. Schema Hierarchy & Separation

The database is divided into two distinct logical tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL Database: s_clinic                    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌─────────────────────────────────┐         ┌─────────────────────────────────┐
│     Control Plane: `public`     │         │ Tenant Data Plane: `clinic_*`   │
├─────────────────────────────────┤         ├─────────────────────────────────┤
│ • tenants (Clinic Registry)     │         │ • clinics    (Clinic Profile)   │
│ • admin_users (Global & Tenant) │         │ • doctors    (Doctor Profiles)  │
│                                 │         │ • patients   (Patient Master)   │
│                                 │         │ • appointments (Bookings & Log) │
└─────────────────────────────────┘         └─────────────────────────────────┘
                                                           ▲
                                                           │ (Repeated per clinic)
                                            ┌──────────────┴──────────────────┐
                                            │ • clinic_default                │
                                            │ • clinic_apollo                 │
                                            │ • clinic_care_plus              │
                                            └─────────────────────────────────┘
```

### 2.1 Control Plane: Shared `public` Schema
- **`tenants` Table**: System catalog of all registered clinics, their designated schema names, owner contact information, and operational status.
- **`admin_users` Table**: Master authentication table for all platform users across roles (`SUPER_ADMIN`, `CLINIC_ADMIN`, `RECEPTIONIST`), storing bcrypt password hashes and granular screen action permission matrices.

### 2.2 Data Plane: Isolated Clinic Schemas (`clinic_<slug>`)
- Every clinic has an isolated namespace containing:
  - **`clinics`**: Metadata, consultation hours, clinic address, and WhatsApp Business API credentials.
  - **`doctors`**: Working days, morning/evening time slot lists, slot durations, and active statuses.
  - **`patients`**: Master patient registry for that specific clinic.
  - **`appointments`**: Confirmed bookings, appointment timestamps, doctor/clinic snapshots, and 1-hour WhatsApp reminder tracking.

---

## 3. Entity-Relationship Diagram (Mermaid ERD)

```mermaid
erDiagram
    %% Control Plane in public schema
    tenants ||--o{ clinics : "provisions schema for"
    tenants ||--o{ admin_users : "employs staff"

    %% Clinical Entities inside clinic_<slug> schema
    clinics ||--o{ doctors : "hosts"
    clinics ||--o{ appointments : "schedules at"
    doctors ||--o{ appointments : "attends"
    patients ||--o{ appointments : "books"

    tenants {
        string id PK "UUID"
        string name "Clinic / Tenant Name"
        string schema_name "PostgreSQL Schema Identifier"
        string owner_name "Doctor / Owner Full Name"
        string owner_phone "Contact Phone"
        string owner_email "Contact Email"
        string status "ACTIVE | SUSPENDED"
        datetime created_at "UTC Timestamp"
        datetime updated_at "UTC Timestamp"
    }

    admin_users {
        string id PK "UUID"
        string username UK "Unique Username"
        string hashed_password "Bcrypt Hash"
        string full_name "User Full Name"
        string role "SUPER_ADMIN | CLINIC_ADMIN | RECEPTIONIST"
        string tenant_id FK "References tenants.id"
        string clinic_id "Associated Clinic ID"
        json permissions "Screen & Action Matrix (view, create, edit, delete)"
        boolean is_active "Active Flag"
        datetime created_at "UTC Timestamp"
        datetime updated_at "UTC Timestamp"
    }

    clinics {
        string id PK "UUID"
        string tenant_id "Tenant ID"
        string name "Clinic Display Name"
        string address "Physical Address"
        string phone "Clinic Contact Phone (NULL allowed)"
        string timezone "Default: Asia/Kolkata"
        string consultation_hours "Consultation Schedule"
        string whatsapp_phone_number_id "Meta WhatsApp ID"
        datetime created_at "UTC Timestamp"
        datetime updated_at "UTC Timestamp"
    }

    doctors {
        string id PK "UUID"
        string clinic_id FK "References clinics.id"
        string name "Doctor Full Name"
        string specialty "Medical Specialty"
        string available_days "e.g. Mon,Tue,Wed,Thu,Fri,Sat"
        string morning_slots "Comma-separated time slots"
        string evening_slots "Comma-separated time slots"
        int slot_duration_minutes "Default: 30"
        boolean is_active "Default: TRUE"
        datetime created_at "UTC Timestamp"
        datetime updated_at "UTC Timestamp"
    }

    patients {
        string id PK "UUID"
        string tenant_id "Tenant ID"
        string full_name "Patient Full Name"
        string mobile_number "Indexed 10-digit Phone"
        datetime created_at "UTC Timestamp"
        datetime updated_at "UTC Timestamp"
    }

    appointments {
        string id PK "UUID"
        string tenant_id "Tenant ID"
        string clinic_id FK "References clinics.id"
        string doctor_id FK "References doctors.id"
        string patient_id "Associated Patient ID"
        string patient_name "Snapshot Patient Name"
        string mobile_number "Patient Contact Phone"
        string doctor_name "Snapshot Doctor Name"
        string clinic_name "Snapshot Clinic Name"
        string clinic_address "Snapshot Address"
        string appointment_date "YYYY-MM-DD"
        string time_slot "e.g. 10:30 AM"
        datetime appointment_datetime "Local to UTC Converted"
        string status "CONFIRMED | COMPLETED | CANCELLED | RESCHEDULED"
        boolean reminder_sent "Default: FALSE"
        datetime reminder_sent_at "Timestamp of WhatsApp notification"
        datetime created_at "UTC Timestamp"
        datetime updated_at "UTC Timestamp"
    }
```

---

## 4. Database Table Specifications & Clean Column Design

All hardcoded domain values have been removed from table DDL. Initial seed values are only injected dynamically via `database_service.py` if explicitly requested.

| Schema | Table | Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `public` | `tenants` | `id` | `VARCHAR(36)` | `PRIMARY KEY` | UUID string |
| `public` | `tenants` | `name` | `VARCHAR(100)` | `NOT NULL` | Clinic business name |
| `public` | `tenants` | `schema_name` | `VARCHAR(63)` | `NOT NULL` | Schema name (e.g. `clinic_apollo`) |
| `public` | `tenants` | `owner_name` | `VARCHAR(100)` | `NULL` | Clinic doctor / owner name |
| `public` | `tenants` | `status` | `VARCHAR(20)` | `DEFAULT 'ACTIVE'` | ACTIVE or SUSPENDED |
| `public` | `admin_users` | `id` | `VARCHAR(36)` | `PRIMARY KEY` | UUID string |
| `public` | `admin_users` | `username` | `VARCHAR(50)` | `UNIQUE, NOT NULL` | Login username |
| `public` | `admin_users` | `role` | `VARCHAR(30)` | `NOT NULL` | `SUPER_ADMIN`, `CLINIC_ADMIN`, `RECEPTIONIST` |
| `public` | `admin_users` | `permissions` | `JSON` | `NULL` | Action matrix per screen |
| `clinic_*` | `clinics` | `id` | `VARCHAR(36)` | `PRIMARY KEY` | UUID string |
| `clinic_*` | `clinics` | `name` | `VARCHAR(150)` | `NOT NULL` | Clean clinic name |
| `clinic_*` | `clinics` | `phone` | `VARCHAR(30)` | `NULL` | Clean contact phone |
| `clinic_*` | `clinics` | `consultation_hours`| `VARCHAR(255)` | `NULL` | Working hours schedule |
| `clinic_*` | `doctors` | `id` | `VARCHAR(36)` | `PRIMARY KEY` | UUID string |
| `clinic_*` | `doctors` | `clinic_id` | `VARCHAR(36)` | `FK -> clinics.id` | Cascading clinic reference |
| `clinic_*` | `doctors` | `name` | `VARCHAR(100)` | `NOT NULL` | Doctor's full name |
| `clinic_*` | `doctors` | `specialty` | `VARCHAR(100)` | `NOT NULL` | Specialty (e.g., General Physician) |
| `clinic_*` | `doctors` | `available_days`| `VARCHAR(100)` | `NOT NULL` | Available days string |
| `clinic_*` | `doctors` | `morning_slots` | `VARCHAR(255)` | `NULL` | Available morning slots |
| `clinic_*` | `doctors` | `evening_slots` | `VARCHAR(255)` | `NULL` | Available evening slots |
| `clinic_*` | `patients`| `id` | `VARCHAR(36)` | `PRIMARY KEY` | UUID string |
| `clinic_*` | `patients`| `mobile_number` | `VARCHAR(20)` | `NOT NULL, INDEX` | 10-digit mobile number |
| `clinic_*` | `appointments` | `id` | `VARCHAR(36)` | `PRIMARY KEY` | UUID string |
| `clinic_*` | `appointments` | `doctor_name` | `VARCHAR(100)` | `NOT NULL` | Snapshot of doctor name at booking |
| `clinic_*` | `appointments` | `clinic_name` | `VARCHAR(150)` | `NOT NULL` | Snapshot of clinic name at booking |
| `clinic_*` | `appointments` | `appointment_datetime` | `TIMESTAMP WITH TZ` | `NOT NULL, INDEX`| Standardized UTC slot timestamp |
| `clinic_*` | `appointments` | `reminder_sent`| `BOOLEAN` | `DEFAULT FALSE, INDEX`| 1-Hour WhatsApp reminder sent flag |

---

## 5. End-to-End System Workflows

### Workflow 1: Application Boot & Database Initialization
```mermaid
sequenceDiagram
    autonumber
    participant App as FastAPI Startup
    participant DB as init_db()
    participant PG as PostgreSQL Server

    App->>DB: Trigger init_db()
    DB->>PG: SELECT 1 (Connection Ping)
    alt Target Database Missing
        DB->>PG: Auto-execute CREATE DATABASE "s_clinic"
    end
    DB->>PG: SET search_path TO public;
    DB->>PG: Create public tables: tenants, admin_users
    DB->>PG: Auto-migrate schema_name, permissions columns
    DB->>DB: provision_tenant_schema("clinic_default")
    DB->>PG: CREATE SCHEMA IF NOT EXISTS "clinic_default"
    DB->>PG: Execute DDL for clinics, doctors, patients, appointments
    DB->>PG: Drop any lingering default constraints
    DB-->>App: Database Ready & Connection Pool Warm
```

---

### Workflow 2: Clinic Onboarding & Isolated Schema Provisioning
```mermaid
sequenceDiagram
    autonumber
    actor SA as Super Admin (Product Owner)
    participant API as /api/v1/admin/tenants
    participant Prov as provision_tenant_schema()
    participant PG as PostgreSQL Server

    SA->>API: POST /tenants { name: "Apollo Health", owner_phone: "+91 98230..." }
    API->>API: Sanitize schema name -> "clinic_apollo_health"
    API->>Prov: provision_tenant_schema("clinic_apollo_health")
    Prov->>PG: CREATE SCHEMA IF NOT EXISTS "clinic_apollo_health";
    Prov->>PG: CREATE TABLE "clinic_apollo_health".clinics (...)
    Prov->>PG: CREATE TABLE "clinic_apollo_health".doctors (...)
    Prov->>PG: CREATE TABLE "clinic_apollo_health".patients (...)
    Prov->>PG: CREATE TABLE "clinic_apollo_health".appointments (...)
    Prov->>PG: Create Indexes on appointment_date, mobile_number
    API->>PG: INSERT INTO public.tenants (name, schema_name, ...)
    API->>PG: INSERT INTO "clinic_apollo_health".clinics (name, address, ...)
    API-->>SA: 201 Created (Tenant & Dedicated Schema Ready)
```

---

### Workflow 3: Front Desk User Creation & Granular Permissions Assignment
Doctors (Clinic Admins) create their front desk staff and assign screen and action permissions:

```mermaid
sequenceDiagram
    autonumber
    actor Doc as Doctor (Clinic Admin)
    participant API as /api/v1/admin/users
    participant Perm as Granular Permission Matrix
    participant PG as PostgreSQL (public.admin_users)

    Doc->>API: POST /admin/users { username: "pooja_desk", role: "RECEPTIONIST", permissions: {...} }
    API->>API: Verify caller has role CLINIC_ADMIN
    API->>API: Ensure caller can only create RECEPTIONIST role
    API->>Perm: Validate Matrix: appointments(view, create, edit), simulator(view, create)
    API->>PG: INSERT INTO public.admin_users with permissions JSON
    API-->>Doc: 201 Created (Front Desk user created)

    Note over Doc,API: Later: Doctor restricts or expands access
    Doc->>API: PUT /admin/users/{user_id} { permissions: { appointments: { delete: true } } }
    API->>PG: UPDATE public.admin_users SET permissions = :updated
    API-->>Doc: 200 OK (Permissions updated in real-time)
```

**Permission Matrix Schema:**
```json
{
  "appointments": { "view": true, "create": true, "edit": true, "delete": false },
  "patients":     { "view": true, "create": true, "edit": true, "delete": false },
  "doctors":      { "view": true, "create": false, "edit": false, "delete": false },
  "simulator":    { "view": true, "create": true, "edit": false, "delete": false },
  "analytics":    { "view": false, "create": false, "edit": false, "delete": false },
  "users":        { "view": false, "create": false, "edit": false, "delete": false }
}
```

---

### Workflow 4: Tenant Request Routing via PostgreSQL `search_path`
All standard database sessions set `search_path` to the authenticated user's clinic schema. No queries require manual schema prefixing:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Frontend UI / WhatsApp Bot
    participant Auth as JWT Auth & Tenant Resolver
    participant Session as AsyncSession
    participant PG as PostgreSQL Server

    Client->>Auth: Request with Bearer Token (containing tenant_id & schema_name)
    Auth->>Auth: Extract current user & resolve tenant_schema (e.g. "clinic_apollo")
    Auth->>Session: SET search_path TO "clinic_apollo", public;
    Client->>Session: Execute ORM query: select(Appointment).where(...)
    Session->>PG: SELECT * FROM appointments (PostgreSQL routes to "clinic_apollo".appointments)
    PG-->>Session: Return isolated clinic rows
    Session-->>Client: Response (Zero cross-clinic data leaks)
```

---

### Workflow 5: Patient Appointment Booking & Clinical Data Flow
```mermaid
sequenceDiagram
    autonumber
    actor Patient as Patient (WhatsApp / Admin Portal)
    participant Orchestrator as Orchestration Service
    participant Tools as Appointment Tools
    participant DBSvc as DatabaseService.create_appointment()
    participant PG as PostgreSQL ("clinic_<slug>")

    Patient->>Orchestrator: "I'd like to book an appointment with Dr. Siddhi for tomorrow"
    Orchestrator->>Tools: check_available_slots("2026-11-20")
    Tools->>PG: SELECT time_slot FROM appointments WHERE date = '2026-11-20' AND status = 'CONFIRMED'
    PG-->>Tools: Booked slots
    Tools-->>Orchestrator: Available slots: 10:30 AM, 05:15 PM
    Orchestrator-->>Patient: "Available slots: 10:30 AM, 05:15 PM. Please choose."
    Patient->>Orchestrator: "05:15 PM please"
    Orchestrator->>DBSvc: create_appointment(patient_name, phone, slot, tenant_schema)
    DBSvc->>PG: Query Clinic profile & Doctor profile
    DBSvc->>PG: INSERT INTO patients (name, phone) ON CONFLICT DO NOTHING
    DBSvc->>PG: INSERT INTO appointments (patient_name, doctor_name, clinic_name, slot, datetime, reminder_sent=FALSE)
    DBSvc-->>Orchestrator: Appointment Confirmed Record
    Orchestrator-->>Patient: "🎉 Appointment Confirmed! 1-hour WhatsApp reminder will be sent."
```

---

### Workflow 6: Automated 1-Hour WhatsApp Reminder Background Engine
```mermaid
sequenceDiagram
    autonumber
    participant Cron as Reminder Scheduler (Every 60s)
    participant Scanner as DatabaseService.get_pending_reminders()
    participant WA as WhatsApp Cloud API
    participant PG as PostgreSQL ("clinic_<slug>")

    loop Every 60 Seconds
        Cron->>Scanner: Scan all tenant schemas for upcoming appointments
        Scanner->>PG: SELECT * FROM appointments WHERE appointment_datetime <= (NOW() + 60 mins) AND reminder_sent = FALSE AND status = 'CONFIRMED'
        PG-->>Scanner: Return matching appointments
        loop For each upcoming appointment
            Scanner->>WA: Send WhatsApp Template / Message ("Your appointment is in 1 hour")
            WA-->>Scanner: 200 OK (Message Queued / Delivered)
            Scanner->>PG: UPDATE appointments SET reminder_sent = TRUE, reminder_sent_at = NOW() WHERE id = :appt_id
        end
    end
```

---

## 6. Verification & Inspection Cheat Sheet

### View All Provisioned Tenant Schemas
```sql
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name LIKE 'clinic_%' 
ORDER BY schema_name;
```

### Verify Table Isolation in a Dedicated Tenant Schema
```sql
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema = 'clinic_apollo' 
ORDER BY table_name;
```

### Verify Clean Column Defaults (No Hardcoded Domain Strings)
```sql
SELECT table_schema, table_name, column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'clinic_default'
  AND column_name IN (
    'phone', 'consultation_hours', 'specialty', 
    'available_days', 'morning_slots', 'evening_slots', 
    'doctor_name', 'clinic_name', 'clinic_address'
  );
-- All column_default values will return NULL (no hardcoded strings in DDL)
```

### Inspect Granular Permissions of Front Desk Users
```sql
SELECT username, role, full_name, permissions 
FROM public.admin_users 
WHERE role = 'RECEPTIONIST';
```

---

## 7. Summary of Completed Improvements

1. **Removed Domain Defaults**: Hardcoded values (`Dr. Siddhi Patel`, `Dr. Siddhi Patel's Clinic`, `+91 98765 00000`, `General Physician`, `Mon,Tue,Wed,Thu,Fri,Sat`, etc.) have been completely removed from SQLAlchemy models, Pydantic schemas, and PostgreSQL DDL statements.
2. **Dynamic Runtime Resolution**: All appointments dynamically query doctor and clinic profiles, capturing snapshot fields accurately at booking time.
3. **Database Drop Migration**: Existing tables in `clinic_default` and `public` were automatically updated to drop any lingering default constraints.
4. **Complete Multi-Tenant Documentation**: This comprehensive guide outlines the entity relationships, lifecycle sequences, schema isolation patterns, and verification queries.
