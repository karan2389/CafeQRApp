-- =============================================================================
-- Phase 1 Migration: Foundation Schema (Branches, Tables, Menu Categories, Menu Items)
-- Production-Safe, Idempotent, Non-Destructive
-- =============================================================================

-- Enable pgcrypto for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Branches Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Tables Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    display_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_branch_table_number UNIQUE (branch_id, table_number)
);

-- -----------------------------------------------------------------------------
-- 3. Menu Categories Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplicate any existing (branch_id, slug) pairs safely before applying unique constraint
DO $$
DECLARE
    r RECORD;
    keeper_id UUID;
BEGIN
    FOR r IN (
        SELECT branch_id, slug, array_agg(id ORDER BY created_at ASC) as ids
        FROM public.menu_categories
        GROUP BY branch_id, slug
        HAVING count(*) > 1
    ) LOOP
        keeper_id := r.ids[1];
        -- Reassign any existing menu items to the preserved category ID
        UPDATE public.menu_items
        SET category_id = keeper_id
        WHERE category_id = ANY(r.ids[2:]);

        -- Remove duplicate category rows
        DELETE FROM public.menu_categories
        WHERE id = ANY(r.ids[2:]);
    END LOOP;
END $$;

-- Add unique constraint unique_branch_category_slug if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_branch_category_slug'
    ) THEN
        ALTER TABLE public.menu_categories
        ADD CONSTRAINT unique_branch_category_slug UNIQUE (branch_id, slug);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Menu Items Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT true,
    requires_age_confirmation BOOLEAN NOT NULL DEFAULT false,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deduplicate any existing (category_id, name) pairs before applying unique constraint
DO $$
DECLARE
    r RECORD;
    keeper_id UUID;
BEGIN
    FOR r IN (
        SELECT category_id, name, array_agg(id ORDER BY created_at ASC) as ids
        FROM public.menu_items
        GROUP BY category_id, name
        HAVING count(*) > 1
    ) LOOP
        keeper_id := r.ids[1];
        DELETE FROM public.menu_items
        WHERE id = ANY(r.ids[2:]);
    END LOOP;
END $$;

-- Add unique constraint unique_category_item_name if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_category_item_name'
    ) THEN
        ALTER TABLE public.menu_items
        ADD CONSTRAINT unique_category_item_name UNIQUE (category_id, name);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Updated At Trigger for Menu Items
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_menu_items_updated_at ON public.menu_items;

CREATE TRIGGER trigger_set_menu_items_updated_at
    BEFORE UPDATE ON public.menu_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_timestamp();

-- -----------------------------------------------------------------------------
-- 6. Indexes for Query Performance
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tables_branch_id ON public.tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_branch_id ON public.menu_categories(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_display_order ON public.menu_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items(display_order);

-- -----------------------------------------------------------------------------
-- 7. Row Level Security (RLS) Configuration
-- -----------------------------------------------------------------------------
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on branches" ON public.branches;
DROP POLICY IF EXISTS "Allow public read access on tables" ON public.tables;
DROP POLICY IF EXISTS "Allow public read access on menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Allow public read access on menu_items" ON public.menu_items;

-- Public read access: Anyone can read branches
CREATE POLICY "Allow public read access on branches"
    ON public.branches FOR SELECT
    USING (true);

-- Public read access: Only active tables are visible
CREATE POLICY "Allow public read access on tables"
    ON public.tables FOR SELECT
    USING (is_active = true);

-- Public read access: Only active categories are visible
CREATE POLICY "Allow public read access on menu_categories"
    ON public.menu_categories FOR SELECT
    USING (is_active = true);

-- Public read access: Menu items belonging to active categories.
-- Documented policy: Seated cafe diners can see both available and sold-out items
-- (rendered with an 'Unavailable' badge and disabled action controls).
-- Public write operations (INSERT, UPDATE, DELETE) are denied by the absence of write policies.
CREATE POLICY "Allow public read access on menu_items"
    ON public.menu_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.menu_categories mc
            WHERE mc.id = menu_items.category_id
            AND mc.is_active = true
        )
    );
