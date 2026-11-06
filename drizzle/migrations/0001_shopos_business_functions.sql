
CREATE OR REPLACE FUNCTION public.seed_shop(p_shop uuid, p_with_samples boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_names text[][] := ARRAY[['James','Smith'],['Emily','Johnson'],['Michael','Williams'],['Emma','Brown'],['David','Jones'],['Olivia','Garcia'],['Robert','Miller'],['Sophia','Davis']];
  v_cars text[][] := ARRAY[['2021','Toyota','Camry'],['2019','Honda','Accord'],['2022','Ford','F-150'],['2020','Subaru','Outback'],['2018','BMW','330i'],['2023','Chevrolet','Silverado 1500'],['2019','Mazda','CX-5'],['2022','Hyundai','Tucson']];
  v_concerns text[] := ARRAY['Routine 30k mile maintenance and synthetic oil service','Squealing noise when applying brakes at low speed','Check engine light on, slight hesitation on acceleration','AC blowing warm air intermittently','Coolant leak under front radiator area','Vibration through steering wheel above 60 MPH','Pre-purchase multi-point inspection','Transmission shifting roughly between 2nd and 3rd'];
  v_status_codes text[] := ARRAY['CHECKED_IN','CHECKED_IN','DVI_INSPECTION','WAITING_PARTS','IN_LABOR','IN_LABOR','QUALITY_CONTROL','APPT'];
  v_cust uuid; v_veh uuid; v_status uuid; v_vendor uuid; i int;
BEGIN
  INSERT INTO status_pipelines (shop_id, step_order, status_code, label, color_hex, time_select_mode, default_duration_minutes, cooldown_seconds, requires_parts_vendor, requires_qc_signoff, requires_dvi_complete, is_terminal) VALUES
    (p_shop,1,'APPT','Appointment Booked','#6366f1',1,0,0,false,false,false,false),
    (p_shop,2,'CHECKED_IN','Checked In / Intake','#2563eb',1,0,15,false,false,false,false),
    (p_shop,3,'DVI_INSPECTION','Digital Inspection (DVI)','#0891b2',2,45,15,false,false,true,false),
    (p_shop,4,'WAITING_PARTS','Waiting on Parts','#d97706',2,180,15,true,false,false,false),
    (p_shop,5,'IN_LABOR','In Progress (Active Labor)','#7c3aed',4,0,15,false,false,false,false),
    (p_shop,6,'QUALITY_CONTROL','Quality Control / Road Test','#ea580c',4,30,15,false,true,false,false),
    (p_shop,7,'COMPLETED_READY','Vehicle Ready / Invoiced','#059669',1,0,0,false,true,false,true)
  ON CONFLICT DO NOTHING;
  INSERT INTO bays (shop_id, name, bay_type, display_order) VALUES
    (p_shop,'Bay 1','lift',1),(p_shop,'Bay 2','lift',2),(p_shop,'Bay 3','general',3),(p_shop,'Bay 4','general',4),(p_shop,'Alignment','alignment',5),(p_shop,'Wash','wash',6)
  ON CONFLICT DO NOTHING;
  INSERT INTO parts_vendors (shop_id, name, phone) VALUES
    (p_shop,'NAPA Auto Parts','+15550100001'),(p_shop,'AutoZone Commercial','+15550100002'),(p_shop,'Dealer OEM Parts','+15550100003')
  ON CONFLICT DO NOTHING;
  INSERT INTO dvi_templates (shop_id, title, is_default, categories) VALUES (p_shop, 'Standard Vehicle Health Inspection', true,
    '[{"name":"Brakes & Tires","items":["Front Brake Pads & Rotors","Rear Brake Pads & Rotors","Tire Tread Depth & Wear Pattern"]},
      {"name":"Under Hood & Fluids","items":["Engine Oil Condition & Level","Brake Fluid Moisture Level","Coolant Protection & Level","Battery Health & Terminals"]},
      {"name":"Suspension & Steering","items":["Front Shocks & Struts","Control Arms & Bushings","Tie Rods & Ball Joints"]},
      {"name":"Exterior & Lighting","items":["Headlights & High Beams","Brake & Tail Lights","Wiper Blades & Washer Nozzles"]}]'::jsonb);
  INSERT INTO ro_sequences (shop_id, next_value) VALUES (p_shop, 1000) ON CONFLICT DO NOTHING;

  IF p_with_samples THEN
    SELECT id INTO v_vendor FROM parts_vendors WHERE shop_id = p_shop ORDER BY name LIMIT 1;
    FOR i IN 1..8 LOOP
      INSERT INTO customers (shop_id, first_name, last_name, phone_mobile, whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_opt_in_source)
        VALUES (p_shop, v_names[i][1], v_names[i][2], '+1555020' || lpad(i::text, 4, '0'), i % 2 = 0, CASE WHEN i % 2 = 0 THEN now() END, CASE WHEN i % 2 = 0 THEN 'verbal' END)
        RETURNING id INTO v_cust;
      INSERT INTO vehicles (shop_id, customer_id, year, make, model, license_plate)
        VALUES (p_shop, v_cust, v_cars[i][1]::int, v_cars[i][2], v_cars[i][3], 'SHP' || (100 + i))
        RETURNING id INTO v_veh;
      SELECT id INTO v_status FROM status_pipelines WHERE shop_id = p_shop AND status_code = v_status_codes[i];
      UPDATE ro_sequences SET next_value = next_value + 1 WHERE shop_id = p_shop;
      INSERT INTO repair_orders (shop_id, customer_id, vehicle_id, ro_number, concern, current_status_id, status_updated_at, wait_type, parts_vendor_id, dvi_status, eta_due_at)
        VALUES (p_shop, v_cust, v_veh, (999 + i)::text, v_concerns[i], v_status,
          now() - make_interval(mins => 5 + i * 17),
          (ARRAY['waiting','dropoff','shuttle','loaner','dropoff','tow','dropoff','dropoff'])[i],
          CASE WHEN v_status_codes[i] = 'WAITING_PARTS' THEN v_vendor END,
          CASE WHEN v_status_codes[i] IN ('APPT') THEN 'not_started' ELSE 'in_progress' END,
          CASE WHEN i % 3 = 0 THEN now() + make_interval(mins => 30 * i) END);
    END LOOP;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.seed_shop(uuid, boolean) FROM PUBLIC, anon, authenticated;

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
  INSERT INTO shops (tenant_id, name, subdomain) VALUES (v_tenant, v_shop_name, 'shop-' || substr(replace(NEW.id::text, '-', ''), 1, 12))
    RETURNING id INTO v_shop;
  INSERT INTO profiles (id, shop_id, email, first_name, last_name) VALUES (NEW.id, v_shop, NEW.email, v_first, v_last);
  INSERT INTO user_roles (user_id, shop_id, role) VALUES (NEW.id, v_shop, 'owner');
  PERFORM seed_shop(v_shop, true);
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.quick_add_order(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop uuid := require_permission('ro.create');
  c jsonb := p->'customer'; v jsonb := p->'vehicle';
  v_cust uuid := nullif(c->>'id', '')::uuid;
  v_veh uuid := nullif(v->>'id', '')::uuid;
  v_status uuid; v_ro uuid; v_num bigint;
BEGIN
  IF v_cust IS NOT NULL THEN
    PERFORM 1 FROM customers WHERE id = v_cust AND shop_id = v_shop;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Customer not found'; END IF;
  ELSE
    IF coalesce(trim(c->>'firstName'), '') = '' OR coalesce(trim(c->>'lastName'), '') = '' OR coalesce(trim(c->>'phoneMobile'), '') = '' THEN
      RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Customer first name, last name and mobile phone are required';
    END IF;
    SELECT id INTO v_cust FROM customers WHERE shop_id = v_shop AND phone_mobile = c->>'phoneMobile' AND lower(last_name) = lower(c->>'lastName') LIMIT 1;
    IF v_cust IS NULL THEN
      INSERT INTO customers (shop_id, first_name, last_name, phone_mobile, email, whatsapp_opt_in, whatsapp_opt_in_at, whatsapp_opt_in_source)
      VALUES (v_shop, trim(c->>'firstName'), trim(c->>'lastName'), c->>'phoneMobile', nullif(c->>'email', ''),
        coalesce((c->>'whatsappOptIn')::boolean, false),
        CASE WHEN coalesce((c->>'whatsappOptIn')::boolean, false) THEN now() END,
        CASE WHEN coalesce((c->>'whatsappOptIn')::boolean, false) THEN 'verbal' END)
      RETURNING id INTO v_cust;
    END IF;
  END IF;
  IF v_veh IS NOT NULL THEN
    PERFORM 1 FROM vehicles WHERE id = v_veh AND shop_id = v_shop AND customer_id = v_cust;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Vehicle not found'; END IF;
  ELSE
    IF nullif(v->>'vin', '') IS NOT NULL THEN
      SELECT id INTO v_veh FROM vehicles WHERE shop_id = v_shop AND customer_id = v_cust AND vin = upper(v->>'vin') LIMIT 1;
    END IF;
    IF v_veh IS NULL THEN
      IF nullif(v->>'year', '') IS NULL OR coalesce(trim(v->>'make'), '') = '' OR coalesce(trim(v->>'model'), '') = '' THEN
        RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Vehicle year, make and model are required';
      END IF;
      INSERT INTO vehicles (shop_id, customer_id, vin, year, make, model, license_plate, odometer_in)
      VALUES (v_shop, v_cust, nullif(upper(v->>'vin'), ''), (v->>'year')::int, trim(v->>'make'), trim(v->>'model'), nullif(upper(v->>'licensePlate'), ''), nullif(v->>'odometerIn', '')::int)
      RETURNING id INTO v_veh;
    END IF;
  END IF;
  SELECT id INTO v_status FROM status_pipelines WHERE shop_id = v_shop AND status_code = 'CHECKED_IN';
  IF v_status IS NULL THEN
    SELECT id INTO v_status FROM status_pipelines WHERE shop_id = v_shop AND NOT is_terminal ORDER BY step_order LIMIT 1;
  END IF;
  IF v_status IS NULL THEN RAISE EXCEPTION 'INTERNAL' USING DETAIL = 'Shop has no status pipeline'; END IF;
  UPDATE ro_sequences SET next_value = next_value + 1 WHERE shop_id = v_shop RETURNING next_value - 1 INTO v_num;
  IF v_num IS NULL THEN RAISE EXCEPTION 'INTERNAL' USING DETAIL = 'RO sequence missing for shop'; END IF;
  INSERT INTO repair_orders (shop_id, customer_id, vehicle_id, ro_number, concern, keytag, current_status_id, wait_type, eta_due_at, service_advisor_id, created_by, dvi_status)
  VALUES (v_shop, v_cust, v_veh, v_num::text, nullif(p->>'concern', ''), nullif(p->>'keytag', ''), v_status,
    coalesce(nullif(p->>'waitType', ''), 'dropoff'),
    CASE WHEN nullif(p->>'etaMinutes', '')::int > 0 THEN now() + make_interval(mins => (p->>'etaMinutes')::int) END,
    auth.uid(), auth.uid(), 'in_progress')
  RETURNING id INTO v_ro;
  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload)
  VALUES (v_shop, v_ro, auth.uid(), 'RO_CREATED', jsonb_build_object('roNumber', v_num::text));
  RETURN v_ro;
END $$;

CREATE OR REPLACE FUNCTION public.transition_order(
  p_order uuid, p_status uuid, p_expected_version int DEFAULT NULL, p_eta_minutes int DEFAULT NULL,
  p_parts_vendor uuid DEFAULT NULL, p_qc_signoff boolean DEFAULT false, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop uuid := require_permission('ro.transition');
  o repair_orders%ROWTYPE; cur status_pipelines%ROWTYPE; tgt status_pipelines%ROWTYPE;
  v_flags jsonb; v_elapsed int; v_eta timestamptz; v_dvi text; v_vendor uuid;
BEGIN
  SELECT * INTO o FROM repair_orders WHERE id = p_order AND shop_id = v_shop FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Repair order not found'; END IF;
  SELECT * INTO tgt FROM status_pipelines WHERE id = p_status AND shop_id = v_shop;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Target status not found'; END IF;
  SELECT * INTO cur FROM status_pipelines WHERE id = o.current_status_id;
  SELECT feature_flags INTO v_flags FROM shops WHERE id = v_shop;

  IF o.is_archived THEN RAISE EXCEPTION 'ORDER_ARCHIVED' USING DETAIL = 'Repair order is archived'; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> o.row_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING DETAIL = 'Order was modified by another user', HINT = jsonb_build_object('currentVersion', o.row_version)::text;
  END IF;
  IF tgt.id = o.current_status_id THEN RAISE EXCEPTION 'ALREADY_IN_STATUS' USING DETAIL = 'Order is already in this status'; END IF;
  IF cur.is_terminal AND NOT has_permission('ro.reopen') THEN RAISE EXCEPTION 'REOPEN_NOT_ALLOWED' USING DETAIL = 'Closed repair orders cannot be reopened'; END IF;
  v_elapsed := floor(extract(epoch FROM (now() - o.status_updated_at)));
  IF tgt.cooldown_seconds > 0 AND v_elapsed >= 0 AND v_elapsed < tgt.cooldown_seconds THEN
    RAISE EXCEPTION 'COOLDOWN_ACTIVE' USING DETAIL = 'Cooldown active', HINT = jsonb_build_object('retryAfterSeconds', tgt.cooldown_seconds - v_elapsed)::text;
  END IF;
  IF p_parts_vendor IS NOT NULL THEN
    PERFORM 1 FROM parts_vendors WHERE id = p_parts_vendor AND shop_id = v_shop;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Parts vendor not found'; END IF;
  END IF;
  IF tgt.requires_parts_vendor AND o.parts_vendor_id IS NULL AND p_parts_vendor IS NULL THEN
    RAISE EXCEPTION 'PARTS_VENDOR_REQUIRED' USING DETAIL = 'Parts vendor required for this status';
  END IF;
  IF coalesce((v_flags->>'require_dvi')::boolean, false) AND tgt.requires_dvi_complete AND o.dvi_status <> 'approved' THEN
    RAISE EXCEPTION 'DVI_REQUIRED' USING DETAIL = 'Digital vehicle inspection must be approved before entering this status';
  END IF;
  IF p_qc_signoff AND NOT has_permission('qc.signoff') THEN RAISE EXCEPTION 'FORBIDDEN' USING DETAIL = 'You cannot sign off quality control'; END IF;
  IF tgt.requires_qc_signoff AND tgt.is_terminal AND NOT (o.qc_status = 'passed' OR p_qc_signoff) THEN
    RAISE EXCEPTION 'QC_SIGNOFF_REQUIRED' USING DETAIL = 'Quality control sign-off required to complete this order';
  END IF;

  v_eta := o.eta_due_at;
  IF coalesce(p_eta_minutes, 0) > 0 THEN v_eta := now() + make_interval(mins => p_eta_minutes);
  ELSIF tgt.default_duration_minutes > 0 THEN v_eta := now() + make_interval(mins => tgt.default_duration_minutes);
  END IF;
  v_vendor := coalesce(p_parts_vendor, o.parts_vendor_id);
  v_dvi := o.dvi_status;
  IF v_dvi = 'not_started' AND (tgt.status_code IN ('CHECKED_IN','DVI_INSPECTION') OR (cur.status_code = 'APPT' AND tgt.status_code <> 'APPT')) THEN
    v_dvi := 'in_progress';
  END IF;

  UPDATE repair_orders SET current_status_id = tgt.id, status_updated_at = now(), eta_due_at = v_eta,
    parts_vendor_id = v_vendor, qc_status = CASE WHEN p_qc_signoff THEN 'passed' ELSE qc_status END,
    dvi_status = v_dvi, row_version = row_version + 1
  WHERE id = o.id;

  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload)
  VALUES (v_shop, o.id, auth.uid(), 'STATUS_TRANSITION', jsonb_build_object('fromStatusId', o.current_status_id, 'toStatusId', tgt.id,
    'durationSeconds', greatest(v_elapsed, 0), 'notes', p_notes, 'partsVendorId', v_vendor));

  RETURN jsonb_build_object('orderId', o.id, 'statusCode', tgt.status_code, 'isTerminal', tgt.is_terminal,
    'version', o.row_version + 1, 'customerId', o.customer_id);
END $$;

CREATE OR REPLACE FUNCTION public.assign_bay(p_order uuid, p_bay uuid, p_expected_version int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid := require_permission('ro.assign_bay'); o repair_orders%ROWTYPE; v_occ text;
BEGIN
  SELECT * INTO o FROM repair_orders WHERE id = p_order AND shop_id = v_shop FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Repair order not found'; END IF;
  IF o.is_archived THEN RAISE EXCEPTION 'ORDER_ARCHIVED' USING DETAIL = 'Repair order is archived'; END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> o.row_version THEN
    RAISE EXCEPTION 'STALE_VERSION' USING DETAIL = 'Order was modified by another user', HINT = jsonb_build_object('currentVersion', o.row_version)::text;
  END IF;
  IF p_bay IS NOT NULL THEN
    PERFORM 1 FROM bays WHERE id = p_bay AND shop_id = v_shop FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Bay not found'; END IF;
    SELECT ro.ro_number INTO v_occ FROM repair_orders ro JOIN status_pipelines s ON s.id = ro.current_status_id
      WHERE ro.shop_id = v_shop AND ro.bay_id = p_bay AND ro.id <> o.id AND NOT ro.is_archived AND NOT s.is_terminal LIMIT 1;
    IF v_occ IS NOT NULL THEN
      RAISE EXCEPTION 'BAY_OCCUPIED' USING DETAIL = 'This bay is already occupied by RO #' || v_occ;
    END IF;
  END IF;
  UPDATE repair_orders SET bay_id = p_bay, row_version = row_version + 1 WHERE id = o.id;
  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload)
  VALUES (v_shop, o.id, auth.uid(), 'BAY_ASSIGNED', jsonb_build_object('fromBayId', o.bay_id, 'toBayId', p_bay));
  RETURN jsonb_build_object('orderId', o.id, 'version', o.row_version + 1);
END $$;

CREATE OR REPLACE FUNCTION public.archive_order(p_order uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid := require_permission('ro.archive');
BEGIN
  UPDATE repair_orders SET is_archived = true, bay_id = NULL, row_version = row_version + 1 WHERE id = p_order AND shop_id = v_shop AND NOT is_archived;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Repair order not found'; END IF;
  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload) VALUES (v_shop, p_order, auth.uid(), 'RO_ARCHIVED', '{}');
END $$;

CREATE OR REPLACE FUNCTION public.assign_technician(p_order uuid, p_tech uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid := require_permission('ro.assign_bay');
BEGIN
  IF p_tech IS NOT NULL THEN
    PERFORM 1 FROM profiles WHERE id = p_tech AND shop_id = v_shop AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Technician not found'; END IF;
  END IF;
  UPDATE repair_orders SET assigned_technician_id = p_tech, row_version = row_version + 1 WHERE id = p_order AND shop_id = v_shop;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Repair order not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_whatsapp_consent(p_customer uuid, p_opt_in boolean, p_source text DEFAULT 'verbal')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid := require_permission('customers.consent');
BEGIN
  UPDATE customers SET whatsapp_opt_in = p_opt_in,
    whatsapp_opt_in_at = CASE WHEN p_opt_in THEN now() ELSE whatsapp_opt_in_at END,
    whatsapp_opt_in_source = CASE WHEN p_opt_in THEN coalesce(p_source, 'verbal') ELSE whatsapp_opt_in_source END,
    whatsapp_opted_out_at = CASE WHEN p_opt_in THEN NULL ELSE now() END
  WHERE id = p_customer AND shop_id = v_shop;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Customer not found'; END IF;
  INSERT INTO audit_events (shop_id, user_id, event_type, payload)
  VALUES (v_shop, auth.uid(), CASE WHEN p_opt_in THEN 'WHATSAPP_OPT_IN' ELSE 'WHATSAPP_OPT_OUT' END, jsonb_build_object('customerId', p_customer, 'source', p_source));
END $$;

CREATE OR REPLACE FUNCTION public.dvi_start(p_order uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid := require_permission('dvi.edit'); o repair_orders%ROWTYPE; v_tpl uuid; v_dvi uuid;
BEGIN
  SELECT * INTO o FROM repair_orders WHERE id = p_order AND shop_id = v_shop FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Repair order not found'; END IF;
  SELECT id INTO v_dvi FROM dvi_inspections WHERE repair_order_id = o.id ORDER BY created_at LIMIT 1;
  IF v_dvi IS NOT NULL THEN RETURN v_dvi; END IF;
  SELECT id INTO v_tpl FROM dvi_templates WHERE shop_id = v_shop ORDER BY is_default DESC LIMIT 1;
  IF v_tpl IS NULL THEN RAISE EXCEPTION 'INTERNAL' USING DETAIL = 'No inspection template configured'; END IF;
  INSERT INTO dvi_inspections (shop_id, repair_order_id, template_id, technician_id) VALUES (v_shop, o.id, v_tpl, auth.uid()) RETURNING id INTO v_dvi;
  IF o.dvi_status = 'not_started' THEN
    UPDATE repair_orders SET dvi_status = 'in_progress', row_version = row_version + 1 WHERE id = o.id;
  END IF;
  RETURN v_dvi;
END $$;

CREATE OR REPLACE FUNCTION public.dvi_submit(p_dvi uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid := require_permission('dvi.edit'); d dvi_inspections%ROWTYPE;
BEGIN
  SELECT * INTO d FROM dvi_inspections WHERE id = p_dvi AND shop_id = v_shop FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Inspection not found'; END IF;
  PERFORM 1 FROM dvi_items WHERE dvi_id = d.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Record at least one finding before submitting'; END IF;
  UPDATE dvi_inspections SET submitted_at = now() WHERE id = d.id;
  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload) VALUES (v_shop, d.repair_order_id, auth.uid(), 'DVI_SUBMITTED', jsonb_build_object('dviId', d.id));
END $$;

CREATE OR REPLACE FUNCTION public.dvi_send(p_dvi uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_shop uuid := require_permission('dvi.send'); d dvi_inspections%ROWTYPE; v_token text; v_cust uuid;
BEGIN
  SELECT * INTO d FROM dvi_inspections WHERE id = p_dvi AND shop_id = v_shop FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Inspection not found'; END IF;
  IF d.customer_authorized_at IS NOT NULL THEN RAISE EXCEPTION 'PORTAL_ALREADY_AUTHORIZED' USING DETAIL = 'Customer has already authorized this inspection'; END IF;
  PERFORM 1 FROM dvi_items WHERE dvi_id = d.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Record at least one finding before sending'; END IF;
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
  UPDATE dvi_inspections SET access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    access_token_expires_at = now() + interval '7 days', sent_at = now() WHERE id = d.id;
  UPDATE repair_orders SET dvi_status = 'sent', row_version = row_version + 1 WHERE id = d.repair_order_id RETURNING customer_id INTO v_cust;
  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload) VALUES (v_shop, d.repair_order_id, auth.uid(), 'DVI_SENT', jsonb_build_object('dviId', d.id));
  RETURN jsonb_build_object('token', v_token, 'repairOrderId', d.repair_order_id, 'customerId', v_cust);
END $$;

CREATE OR REPLACE FUNCTION public.portal_resolve(p_token text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT id FROM dvi_inspections
  WHERE access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND access_token_expires_at > now()
$$;

CREATE OR REPLACE FUNCTION public.portal_authorize(p_token text, p_decisions jsonb, p_signature_key text, p_ip text, p_ua text, p_consent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE d dvi_inspections%ROWTYPE; v_id uuid := portal_resolve(p_token); dec jsonb; v_cents bigint := 0; v_declined int := 0; v_cost numeric;
BEGIN
  IF v_id IS NULL THEN RAISE EXCEPTION 'PORTAL_LINK_INVALID' USING DETAIL = 'This link is not valid or has expired'; END IF;
  SELECT * INTO d FROM dvi_inspections WHERE id = v_id FOR UPDATE;
  IF d.customer_authorized_at IS NOT NULL THEN RAISE EXCEPTION 'PORTAL_ALREADY_AUTHORIZED' USING DETAIL = 'This inspection has already been authorized'; END IF;
  FOR dec IN SELECT * FROM jsonb_array_elements(p_decisions) LOOP
    SELECT coalesce(estimated_cost, 0) INTO v_cost FROM dvi_items WHERE id = (dec->>'itemId')::uuid AND dvi_id = d.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Decision refers to an unknown item'; END IF;
    UPDATE dvi_items SET customer_approved = (dec->>'approved')::boolean WHERE id = (dec->>'itemId')::uuid;
    IF (dec->>'approved')::boolean THEN v_cents := v_cents + round(v_cost * 100); ELSE v_declined := v_declined + 1; END IF;
  END LOOP;
  UPDATE dvi_inspections SET customer_authorized_at = now(), customer_signature_key = p_signature_key,
    customer_ip_address = left(p_ip, 45), customer_user_agent = left(p_ua, 500), consent_text = p_consent WHERE id = d.id;
  UPDATE repair_orders SET dvi_status = 'approved', row_version = row_version + 1 WHERE id = d.repair_order_id;
  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload)
  VALUES (d.shop_id, d.repair_order_id, NULL, 'DVI_APPROVED', jsonb_build_object('dviId', d.id, 'approvedCents', v_cents, 'declined', v_declined, 'ip', p_ip));
  RETURN jsonb_build_object('approvedTotalCents', v_cents, 'declinedCount', v_declined);
END $$;

REVOKE EXECUTE ON FUNCTION public.portal_resolve(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_authorize(text, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_resolve(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_authorize(text, jsonb, text, text, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.quick_add_order(jsonb), public.transition_order(uuid, uuid, int, int, uuid, boolean, text),
  public.assign_bay(uuid, uuid, int), public.archive_order(uuid), public.assign_technician(uuid, uuid),
  public.set_whatsapp_consent(uuid, boolean, text), public.dvi_start(uuid), public.dvi_submit(uuid), public.dvi_send(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quick_add_order(jsonb), public.transition_order(uuid, uuid, int, int, uuid, boolean, text),
  public.assign_bay(uuid, uuid, int), public.archive_order(uuid), public.assign_technician(uuid, uuid),
  public.set_whatsapp_consent(uuid, boolean, text), public.dvi_start(uuid), public.dvi_submit(uuid), public.dvi_send(uuid) TO authenticated;

CREATE POLICY "dvi media read own shop" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dvi-media' AND (storage.foldername(name))[1] = public.current_shop_id()::text);
CREATE POLICY "dvi media upload own shop" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dvi-media' AND (storage.foldername(name))[1] = public.current_shop_id()::text AND public.has_permission('dvi.edit'));
CREATE POLICY "dvi media delete own shop" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dvi-media' AND (storage.foldername(name))[1] = public.current_shop_id()::text AND public.has_permission('dvi.edit'));
