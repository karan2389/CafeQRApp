-- =============================================================================
-- Cafe QR Ordering System: Phase 1 Foundation Migration & Seed Script
-- Safe to run in Supabase SQL Editor (Idempotent, Non-Destructive, Rerunnable)
-- =============================================================================

-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Tables Creation
-- -----------------------------------------------------------------------------

-- Branches
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tables
CREATE TABLE IF NOT EXISTS public.tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    display_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_branch_table_number UNIQUE (branch_id, table_number)
);

-- Menu Categories
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
        UPDATE public.menu_items
        SET category_id = keeper_id
        WHERE category_id = ANY(r.ids[2:]);

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

-- Menu Items
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
-- 2. Updated At Trigger for Menu Items
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
-- 3. Performance Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tables_branch_id ON public.tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_branch_id ON public.menu_categories(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_display_order ON public.menu_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items(display_order);

-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS) & Read-Only Policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on branches" ON public.branches;
DROP POLICY IF EXISTS "Allow public read access on tables" ON public.tables;
DROP POLICY IF EXISTS "Allow public read access on menu_categories" ON public.menu_categories;
DROP POLICY IF EXISTS "Allow public read access on menu_items" ON public.menu_items;

CREATE POLICY "Allow public read access on branches"
    ON public.branches FOR SELECT
    USING (true);

CREATE POLICY "Allow public read access on tables"
    ON public.tables FOR SELECT
    USING (is_active = true);

CREATE POLICY "Allow public read access on menu_categories"
    ON public.menu_categories FOR SELECT
    USING (is_active = true);

-- Menu items belonging to active categories
CREATE POLICY "Allow public read access on menu_items"
    ON public.menu_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.menu_categories mc
            WHERE mc.id = menu_items.category_id
            AND mc.is_active = true
        )
    );

-- Deny all public mutations: No public INSERT, UPDATE, or DELETE policies exist.

-- -----------------------------------------------------------------------------
-- 5. Seed Data (Idempotent: 1 Branch, 6 Tables, 6 Categories, 10 Menu Items)
-- Non-destructive: No DELETE statements used.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_branch_id UUID;
    v_cat_coffee UUID;
    v_cat_cold UUID;
    v_cat_breakfast UUID;
    v_cat_bowls UUID;
    v_cat_bakes UUID;
    v_cat_puffs UUID;
BEGIN
    -- Branch
    INSERT INTO public.branches (name, slug)
    VALUES ('Ember & Oak', 'ember-and-oak')
    ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name
    RETURNING id INTO v_branch_id;

    -- 6 Tables
    INSERT INTO public.tables (branch_id, table_number, display_name, is_active)
    VALUES
        (v_branch_id, 1, 'Table 1', true),
        (v_branch_id, 2, 'Table 2', true),
        (v_branch_id, 3, 'Table 3', true),
        (v_branch_id, 4, 'Table 4', true),
        (v_branch_id, 5, 'Table 5', false), -- Closed in demo seed state
        (v_branch_id, 6, 'Table 6', true)
    ON CONFLICT (branch_id, table_number) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        is_active = EXCLUDED.is_active;

    -- Categories (Idempotent upsert on (branch_id, slug))
    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Coffee', 'coffee', 1, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_coffee;

    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Cold', 'cold', 2, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_cold;

    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Breakfast', 'breakfast', 3, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_breakfast;

    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Bowls', 'bowls', 4, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_bowls;

    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Bakes', 'bakes', 5, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_bakes;

    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Puffs', 'puffs', 6, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_puffs;

    -- Menu Items (Non-destructive upsert on (category_id, name))
    -- Prices stored directly in Rupees (₹)
    INSERT INTO public.menu_items (category_id, name, description, price, image_url, is_available, requires_age_confirmation, display_order)
    VALUES
        (v_cat_coffee, 'Cortado', 'Double espresso softened with warm textured milk.', 190.00, '/menu/cortado.svg', true, false, 1),
        (v_cat_coffee, 'Sea Salt Mocha', 'Dark cocoa, espresso and a delicate sea-salt cream.', 260.00, '/menu/mocha.svg', true, false, 2)
    ON CONFLICT (category_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        price = EXCLUDED.price,
        image_url = EXCLUDED.image_url,
        is_available = EXCLUDED.is_available,
        requires_age_confirmation = EXCLUDED.requires_age_confirmation,
        display_order = EXCLUDED.display_order;

    INSERT INTO public.menu_items (category_id, name, description, price, image_url, is_available, requires_age_confirmation, display_order)
    VALUES
        (v_cat_cold, 'Citrus Cold Brew', 'Slow-steeped coffee lifted with orange and tonic.', 240.00, '/menu/cold-brew.svg', true, false, 3)
    ON CONFLICT (category_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        price = EXCLUDED.price,
        image_url = EXCLUDED.image_url,
        is_available = EXCLUDED.is_available,
        requires_age_confirmation = EXCLUDED.requires_age_confirmation,
        display_order = EXCLUDED.display_order;

    INSERT INTO public.menu_items (category_id, name, description, price, image_url, is_available, requires_age_confirmation, display_order)
    VALUES
        (v_cat_breakfast, 'Forest Toast', 'Sourdough, whipped feta, mushrooms and herbs.', 320.00, '/menu/toast.svg', true, false, 4)
    ON CONFLICT (category_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        price = EXCLUDED.price,
        image_url = EXCLUDED.image_url,
        is_available = EXCLUDED.is_available,
        requires_age_confirmation = EXCLUDED.requires_age_confirmation,
        display_order = EXCLUDED.display_order;

    INSERT INTO public.menu_items (category_id, name, description, price, image_url, is_available, requires_age_confirmation, display_order)
    VALUES
        (v_cat_bowls, 'Harvest Grain Bowl', 'Millets, roasted vegetables, greens and sesame dressing.', 360.00, '/menu/bowl.svg', true, false, 5)
    ON CONFLICT (category_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        price = EXCLUDED.price,
        image_url = EXCLUDED.image_url,
        is_available = EXCLUDED.is_available,
        requires_age_confirmation = EXCLUDED.requires_age_confirmation,
        display_order = EXCLUDED.display_order;

    INSERT INTO public.menu_items (category_id, name, description, price, image_url, is_available, requires_age_confirmation, display_order)
    VALUES
        (v_cat_bakes, 'Burnt Honey Croissant', 'Flaky butter pastry glazed with toasted wildflower honey.', 220.00, '/menu/croissant.svg', false, false, 6)
    ON CONFLICT (category_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        price = EXCLUDED.price,
        image_url = EXCLUDED.image_url,
        is_available = EXCLUDED.is_available,
        requires_age_confirmation = EXCLUDED.requires_age_confirmation,
        display_order = EXCLUDED.display_order;

    INSERT INTO public.menu_items (category_id, name, description, price, image_url, is_available, requires_age_confirmation, display_order)
    VALUES
        (v_cat_puffs, 'Cool Mint', 'A crisp, cool profile with a clean finish.', 650.00, '/menu/puffs.svg', true, true, 7),
        (v_cat_puffs, 'Berry Ice', 'Bright berry notes with a chilled finish.', 680.00, '/menu/puffs.svg', true, true, 8),
        (v_cat_puffs, 'Citrus Rush', 'Fresh citrus with a light cooling edge.', 680.00, '/menu/puffs.svg', true, true, 9),
        (v_cat_puffs, 'Classic Gold', 'A mellow, rounded classic profile.', 720.00, '/menu/puffs.svg', false, true, 10)
    ON CONFLICT (category_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        price = EXCLUDED.price,
        image_url = EXCLUDED.image_url,
        is_available = EXCLUDED.is_available,
        requires_age_confirmation = EXCLUDED.requires_age_confirmation,
        display_order = EXCLUDED.display_order;

END $$;
