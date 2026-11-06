DROP FUNCTION IF EXISTS public.dvi_start(uuid);

CREATE OR REPLACE FUNCTION public.dvi_start(p_order uuid, p_template uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop uuid := require_permission('dvi.edit');
  o repair_orders%ROWTYPE;
  v_tpl uuid;
  v_dvi uuid;
BEGIN
  SELECT * INTO o FROM repair_orders WHERE id = p_order AND shop_id = v_shop FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Repair order not found';
  END IF;

  SELECT id INTO v_dvi FROM dvi_inspections WHERE repair_order_id = o.id ORDER BY created_at LIMIT 1;
  IF v_dvi IS NOT NULL THEN
    RETURN v_dvi;
  END IF;

  IF p_template IS NOT NULL THEN
    SELECT id INTO v_tpl FROM dvi_templates WHERE id = p_template AND shop_id = v_shop;
    IF v_tpl IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Inspection template not found';
    END IF;
  ELSE
    SELECT id INTO v_tpl FROM dvi_templates WHERE shop_id = v_shop ORDER BY is_default DESC, title LIMIT 1;
  END IF;

  IF v_tpl IS NULL THEN
    RAISE EXCEPTION 'INTERNAL' USING DETAIL = 'No inspection template configured';
  END IF;

  INSERT INTO dvi_inspections (shop_id, repair_order_id, template_id, technician_id)
  VALUES (v_shop, o.id, v_tpl, auth.uid())
  RETURNING id INTO v_dvi;

  IF o.dvi_status = 'not_started' THEN
    UPDATE repair_orders SET dvi_status = 'in_progress', row_version = row_version + 1 WHERE id = o.id;
  END IF;

  RETURN v_dvi;
END $$;

REVOKE EXECUTE ON FUNCTION public.dvi_start(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dvi_start(uuid, uuid) TO authenticated;
