-- ServiceFlow multi-tenant schema (shared schema, scoped by organization_id)
-- Idempotent: safe to re-run via `npm run db:migrate`.

-- 1. Users (can belong to many organizations as staff or client)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),                 -- NULL for magic-link-only clients
    magic_token_hash CHAR(64),                  -- SHA-256 of the emailed token (never store raw)
    magic_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_magic_token ON users (magic_token_hash);

-- 2. Organizations (tenants)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,          -- used for /portal/[orgSlug]
    logo_url TEXT,
    brand_color VARCHAR(20) DEFAULT '#2563EB',
    plan_tier VARCHAR(30) DEFAULT 'starter',            -- 'starter', 'pro', 'agency'
    subscription_status VARCHAR(30) DEFAULT 'trialing', -- 'trialing', 'active', 'past_due', 'canceled'
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
    paddle_customer_id VARCHAR(255),
    paddle_subscription_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Organization memberships (RBAC)
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'staff', 'client')),
    company_name VARCHAR(255),                  -- populated when role = 'client'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, user_id)
);

-- 4. Proposals (convert to Project + Invoice on signature)
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_user_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    line_items JSONB NOT NULL DEFAULT '[]',
    total_amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(30) DEFAULT 'sent',          -- 'draft', 'sent', 'signed', 'declined'
    signed_by_name VARCHAR(255),
    signed_ip VARCHAR(45),
    signed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_user_id UUID NOT NULL REFERENCES users(id),
    proposal_id UUID REFERENCES proposals(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(30) DEFAULT 'active',        -- 'active', 'in_review', 'completed', 'archived'
    due_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. Deliverables & approvals
CREATE TABLE IF NOT EXISTS deliverables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    status VARCHAR(30) DEFAULT 'pending_approval', -- 'pending_approval', 'approved', 'changes_requested'
    client_feedback TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Project messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    is_internal_note BOOLEAN DEFAULT FALSE,     -- hidden from 'client' role
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id),
    client_user_id UUID NOT NULL REFERENCES users(id),
    invoice_number VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(30) DEFAULT 'unpaid',        -- 'unpaid', 'paid', 'overdue'
    due_date DATE NOT NULL,
    payment_url TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_client ON projects(organization_id, client_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON invoices(organization_id, status);
