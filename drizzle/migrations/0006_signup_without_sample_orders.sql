-- New independent shops get the starter configuration, but no fabricated customer/RO history.
-- Existing shops and existing repair orders are intentionally untouched.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv staff_invites%ROWTYPE;
  v_tenant uuid; v_shop uuid;
  v_full text := coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '');
  v_first text := coalesce(NEW.raw_user_meta_data->>'first_name', split_part(v_full, ' ', 1), '');
  v_last text := coalesce(NEW.raw_user_meta_data->>'last_name', nullif(substr(v_full, length(split_part(v_full, ' ', 1)) + 2), ''), '');
  v_shop_name text := coalesce(nullif(trim(NEW.raw_user_meta_data->>'shop_name'), ''), 'My Repair Shop');
BEGIN
  SELECT * INTO v_inv FROM staff_invites WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF FOUND THEN
    INSERT INTO profiles (id, shop_id, email, first_name, last_name)
      VALUES (NEW.id, v_inv.shop_id, NEW.email, coalesce(nullif(v_inv.first_name, ''), v_first), coalesce(nullif(v_inv.last_name, ''), v_last));
    INSERT INTO user_roles (user_id, shop_id, role) VALUES (NEW.id, v_inv.shop_id, v_inv.role);
    DELETE FROM staff_invites WHERE id = v_inv.id;
    RETURN NEW;
  END IF;

  INSERT INTO tenants (name) VALUES (v_shop_name) RETURNING id INTO v_tenant;
  INSERT INTO shops (tenant_id, name, subdomain)
    VALUES (v_tenant, v_shop_name, 'shop-' || substr(replace(NEW.id::text, '-', ''), 1, 12))
    RETURNING id INTO v_shop;
  INSERT INTO profiles (id, shop_id, email, first_name, last_name)
    VALUES (NEW.id, v_shop, NEW.email, v_first, v_last);
  INSERT INTO user_roles (user_id, shop_id, role) VALUES (NEW.id, v_shop, 'owner');

  -- Keep the seeded pipeline, bays, vendors, DVI template, and RO sequence,
  -- but do not insert fabricated customers, vehicles, or repair orders.
  PERFORM public.seed_shop(v_shop, false);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
