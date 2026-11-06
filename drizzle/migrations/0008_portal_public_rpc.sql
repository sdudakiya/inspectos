CREATE OR REPLACE FUNCTION public.portal_get(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  d dvi_inspections%ROWTYPE;
  v_id uuid := portal_resolve(p_token);
  v_items jsonb;
  v_vehicle text;
  v_ro_number text;
  v_customer_name text;
  v_shop_name text;
  v_shop_phone text;
BEGIN
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO d FROM dvi_inspections WHERE id = v_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF d.customer_viewed_at IS NULL THEN
    UPDATE dvi_inspections
    SET customer_viewed_at = now()
    WHERE id = d.id AND customer_viewed_at IS NULL;
  END IF;

  SELECT
    ro.ro_number,
    ro.customer_first_name,
    concat_ws(' ', ro.vehicle_year::text, ro.vehicle_make, ro.vehicle_model)
  INTO v_ro_number, v_customer_name, v_vehicle
  FROM board_orders ro
  WHERE ro.id = d.repair_order_id;

  SELECT name, phone_number
  INTO v_shop_name, v_shop_phone
  FROM shops
  WHERE id = d.shop_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'category', i.category,
        'title', i.title,
        'condition', i.condition,
        'notes', i.technician_notes,
        'estimatedCostCents', CASE WHEN i.estimated_cost IS NULL THEN NULL ELSE round(i.estimated_cost * 100)::bigint END,
        'customerApproved', i.customer_approved,
        'media', '[]'::jsonb
      )
      ORDER BY i.created_at
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM dvi_items i
  WHERE i.dvi_id = d.id;

  RETURN jsonb_build_object(
    'shop', jsonb_build_object('name', coalesce(v_shop_name, ''), 'phone', v_shop_phone),
    'customerName', coalesce(v_customer_name, ''),
    'vehicle', coalesce(v_vehicle, ''),
    'roNumber', coalesce(v_ro_number, ''),
    'authorizedAt', d.customer_authorized_at,
    'items', v_items
  );
END $$;

CREATE OR REPLACE FUNCTION public.portal_authorize_public(
  p_token text,
  p_decisions jsonb,
  p_signature_data_url text,
  p_ip text,
  p_ua text,
  p_consent text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  d dvi_inspections%ROWTYPE;
  v_id uuid := portal_resolve(p_token);
  dec jsonb;
  v_cents bigint := 0;
  v_declined int := 0;
  v_cost numeric;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'PORTAL_LINK_INVALID' USING DETAIL = 'This link is not valid or has expired';
  END IF;

  SELECT * INTO d FROM dvi_inspections WHERE id = v_id FOR UPDATE;
  IF d.customer_authorized_at IS NOT NULL THEN
    RAISE EXCEPTION 'PORTAL_ALREADY_AUTHORIZED' USING DETAIL = 'This inspection has already been authorized';
  END IF;

  FOR dec IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    SELECT coalesce(estimated_cost, 0)
    INTO v_cost
    FROM dvi_items
    WHERE id = (dec->>'itemId')::uuid AND dvi_id = d.id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Decision refers to an unknown item';
    END IF;

    UPDATE dvi_items
    SET customer_approved = (dec->>'approved')::boolean
    WHERE id = (dec->>'itemId')::uuid;

    IF (dec->>'approved')::boolean THEN
      v_cents := v_cents + round(v_cost * 100);
    ELSE
      v_declined := v_declined + 1;
    END IF;
  END LOOP;

  UPDATE dvi_inspections
  SET
    customer_authorized_at = now(),
    customer_signature_key = left(p_signature_data_url, 500000),
    customer_ip_address = left(p_ip, 45),
    customer_user_agent = left(p_ua, 500),
    consent_text = p_consent
  WHERE id = d.id;

  UPDATE repair_orders
  SET dvi_status = 'approved', row_version = row_version + 1
  WHERE id = d.repair_order_id;

  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload)
  VALUES (
    d.shop_id,
    d.repair_order_id,
    NULL,
    'DVI_APPROVED',
    jsonb_build_object('dviId', d.id, 'approvedCents', v_cents, 'declined', v_declined, 'ip', p_ip)
  );

  RETURN jsonb_build_object('approvedTotalCents', v_cents, 'declinedCount', v_declined);
END $$;

GRANT EXECUTE ON FUNCTION public.portal_get(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_authorize_public(text, jsonb, text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;
