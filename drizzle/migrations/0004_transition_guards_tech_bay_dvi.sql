DROP FUNCTION IF EXISTS public.transition_order(uuid, uuid, int, int, uuid, boolean, text);

CREATE OR REPLACE FUNCTION public.transition_order(
  p_order uuid, p_status uuid, p_expected_version int DEFAULT NULL, p_eta_minutes int DEFAULT NULL,
  p_parts_vendor uuid DEFAULT NULL, p_qc_signoff boolean DEFAULT false, p_notes text DEFAULT NULL,
  p_technician uuid DEFAULT NULL, p_bay uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shop uuid := require_permission('ro.transition');
  o repair_orders%ROWTYPE; cur status_pipelines%ROWTYPE; tgt status_pipelines%ROWTYPE;
  v_flags jsonb; v_elapsed int; v_eta timestamptz; v_dvi text; v_vendor uuid;
  v_tech uuid; v_bay uuid; v_occ text;
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

  -- Leaving the inspection step forward requires the inspection to have been sent to the customer.
  IF cur.status_code = 'DVI_INSPECTION' AND tgt.step_order > cur.step_order
     AND o.dvi_status NOT IN ('sent','approved')
     AND NOT EXISTS (SELECT 1 FROM dvi_inspections d WHERE d.repair_order_id = o.id AND (d.sent_at IS NOT NULL OR d.submitted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'DVI_NOT_SENT' USING DETAIL = 'Send the inspection to the customer before moving on';
  END IF;
  IF coalesce((v_flags->>'require_dvi')::boolean, false) AND tgt.requires_dvi_complete AND o.dvi_status <> 'approved' THEN
    RAISE EXCEPTION 'DVI_REQUIRED' USING DETAIL = 'Digital vehicle inspection must be approved before entering this status';
  END IF;
  IF p_qc_signoff AND NOT has_permission('qc.signoff') THEN RAISE EXCEPTION 'FORBIDDEN' USING DETAIL = 'You cannot sign off quality control'; END IF;
  IF tgt.requires_qc_signoff AND tgt.is_terminal AND NOT (o.qc_status = 'passed' OR p_qc_signoff) THEN
    RAISE EXCEPTION 'QC_SIGNOFF_REQUIRED' USING DETAIL = 'Quality control sign-off required to complete this order';
  END IF;

  -- Technician and bay assignment (asked for when starting labor).
  v_tech := o.assigned_technician_id;
  v_bay := o.bay_id;
  IF p_technician IS NOT NULL OR p_bay IS NOT NULL THEN
    IF NOT has_permission('ro.assign_bay') THEN RAISE EXCEPTION 'FORBIDDEN' USING DETAIL = 'You cannot assign technicians or bays'; END IF;
  END IF;
  IF p_technician IS NOT NULL THEN
    PERFORM 1 FROM profiles WHERE id = p_technician AND shop_id = v_shop AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Technician not found'; END IF;
    v_tech := p_technician;
  END IF;
  IF p_bay IS NOT NULL THEN
    PERFORM 1 FROM bays WHERE id = p_bay AND shop_id = v_shop FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Bay not found'; END IF;
    SELECT ro.ro_number INTO v_occ FROM repair_orders ro JOIN status_pipelines s ON s.id = ro.current_status_id
      WHERE ro.shop_id = v_shop AND ro.bay_id = p_bay AND ro.id <> o.id AND NOT ro.is_archived AND NOT s.is_terminal LIMIT 1;
    IF v_occ IS NOT NULL THEN RAISE EXCEPTION 'BAY_OCCUPIED' USING DETAIL = 'This bay is already occupied by RO #' || v_occ; END IF;
    v_bay := p_bay;
  END IF;
  IF tgt.status_code = 'IN_LABOR' AND v_tech IS NULL THEN
    RAISE EXCEPTION 'TECHNICIAN_REQUIRED' USING DETAIL = 'Assign a technician before starting work';
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
    dvi_status = v_dvi, assigned_technician_id = v_tech, bay_id = v_bay, row_version = row_version + 1
  WHERE id = o.id;

  INSERT INTO audit_events (shop_id, repair_order_id, user_id, event_type, payload)
  VALUES (v_shop, o.id, auth.uid(), 'STATUS_TRANSITION', jsonb_build_object('fromStatusId', o.current_status_id, 'toStatusId', tgt.id,
    'durationSeconds', greatest(v_elapsed, 0), 'notes', p_notes, 'partsVendorId', v_vendor,
    'technicianId', v_tech, 'bayId', v_bay));

  RETURN jsonb_build_object('orderId', o.id, 'statusCode', tgt.status_code, 'isTerminal', tgt.is_terminal,
    'version', o.row_version + 1, 'customerId', o.customer_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.transition_order(uuid, uuid, int, int, uuid, boolean, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order(uuid, uuid, int, int, uuid, boolean, text, uuid, uuid) TO authenticated, service_role;