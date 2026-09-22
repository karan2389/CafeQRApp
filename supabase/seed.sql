-- =============================================================================
-- Phase 1 Seed Script: Ember & Oak Cafe Initial Data
-- Safe, Non-Destructive, and Idempotent
-- Can be rerun multiple times without deleting or duplicating records.
-- =============================================================================

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
    -- 1. Insert or update Branch
    INSERT INTO public.branches (name, slug)
    VALUES ('Ember & Oak', 'ember-and-oak')
    ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name
    RETURNING id INTO v_branch_id;

    -- 2. Insert or update 6 Tables
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

    -- 3. Insert or update Menu Categories (idempotent with ON CONFLICT (branch_id, slug))
    -- Coffee
    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Coffee', 'coffee', 1, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_coffee;

    -- Cold
    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Cold', 'cold', 2, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_cold;

    -- Breakfast
    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Breakfast', 'breakfast', 3, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_breakfast;

    -- Bowls
    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Bowls', 'bowls', 4, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_bowls;

    -- Bakes
    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Bakes', 'bakes', 5, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_bakes;

    -- Puffs (18+ category)
    INSERT INTO public.menu_categories (branch_id, name, slug, display_order, is_active)
    VALUES (v_branch_id, 'Puffs', 'puffs', 6, true)
    ON CONFLICT (branch_id, slug) DO UPDATE
    SET name = EXCLUDED.name,
        display_order = EXCLUDED.display_order,
        is_active = EXCLUDED.is_active
    RETURNING id INTO v_cat_puffs;

    -- 4. Upsert Menu Items non-destructively (NO DELETE statement)
    -- Coffee Items (Prices stored in INR rupees)
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

    -- Cold Items
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

    -- Breakfast Items
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

    -- Bowls Items
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

    -- Bakes Items
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

    -- Puffs Items (All require age confirmation = true)
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
