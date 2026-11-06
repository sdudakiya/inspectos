-- Tighten helper exposure, guard portal decisions, and add narrow staff/settings writes.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

REVOKE UPDATE ON public.shops, public.profiles FROM authenticated;
GRANT UPDATE (name, phone_number, timezone, feature_flags) ON public.shops TO authenticated;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_delivery_status_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_delivery_status_check
  CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'simulated'));

CREATE OR REPLACE FUNCTION public.set_staff_active(p_user_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop uuid := public.require_permission('staff.manage');
BEGIN
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING DETAIL = 'You cannot deactivate your own account';
  END IF;

  UPDATE public.profiles
  SET is_active = p_active
  WHERE id = p_user_id AND shop_id = v_shop;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING DETAIL = 'Staff member not found';
  END IF;
END
$$;
REVOKE EXECUTE ON FUNCTION public.set_staff_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_staff_active(uuid, boolean) TO authenticated;

-- Portal functions are service-role-only. Keep decision validation inside the
-- transaction so direct server-function calls cannot submit partial/duplicate approvals.
CREATE OR REPLACE FUNCTION public.portal_authorize(
  p_token text,
  p_decisions jsonb,
  p_signature_key text,
  p_ip text,
  p_ua text,
  p_consent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  d public.dvi_inspections%ROWTYPE;
  v_id uuid := public.portal_resolve(p_token);
  dec jsonb;
  v_cents bigint := 0;
  v_declined int := 0;
  v_cost numeric;
  v_expected int;
  v_unique int;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'PORTAL_LINK_INVALID' USING DETAIL = 'This link is not valid or has expired';
  END IF;

  SELECT * INTO d FROM public.dvi_inspections WHERE id = v_id FOR UPDATE;
  IF d.customer_authorized_at IS NOT NULL THEN
    RAISE EXCEPTION 'PORTAL_ALREADY_AUTHORIZED' USING DETAIL = 'This inspection has already been authorized';
  END IF;

  IF p_decisions IS NULL OR jsonb_typeof(p_decisions) <> 'array' THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Decisions must be an array';
  END IF;

  SELECT count(*)::int INTO v_expected
  FROM public.dvi_items
  WHERE dvi_id = d.id AND condition <> 'green';

  SELECT count(DISTINCT value->>'itemId')::int INTO v_unique
  FROM jsonb_array_elements(p_decisions) AS decision(value);

  IF jsonb_array_length(p_decisions) <> v_expected OR v_unique <> jsonb_array_length(p_decisions) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Submit exactly one decision for each recommended item';
  END IF;

  FOR dec IN SELECT value FROM jsonb_array_elements(p_decisions) AS decision(value) LOOP
    SELECT coalesce(estimated_cost, 0) INTO v_cost
    FROM public.dvi_items
    WHERE id = (dec->>'itemId')::uuid AND dvi_id = d.id AND condition <> 'green';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Decision refers to an unknown or non-recommended item';
    END IF;

    IF jsonb_typeof(dec->'approved') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Each decision must include an approval choice';
    END IF;

    UPDATE public.dvi_items
    SET customer_approved = (dec->>'approved')::boolean
    WHERE id = (dec->>'itemId')::uuid AND dvi_id = d.id;

    IF (dec->>'approved')::boolean THEN
      v_cents := v_cents + round(v_cost * 100);
    ELSE
      v_declined := v_declined + 1;
    END IF;
  END LOOP;

  UPDATE public.dvi_inspections
  SET customer_authorized_at = now(),
      customer_signature_key = p_signature_key,
      customer_ip_address = left(p_ip, 45),
      customer_user_agent = left(p_ua, 500),
      consent_text = p_consent
  WHERE id = d.id;

  UPDATE public.repair_orders
  SET dvi_status = 'approved', row_version = row_version + 1
  WHERE id = d.repair_order_id;

  INSERT INTO public.audit_events (shop_id, repair_order_id, user_id, event_type, payload)
  VALUES (
    d.shop_id,
    d.repair_order_id,
    NULL,
    'DVI_APPROVED',
    jsonb_build_object('dviId', d.id, 'approvedCents', v_cents, 'declined', v_declined, 'ip', p_ip)
  );

  RETURN jsonb_build_object('approvedTotalCents', v_cents, 'declinedCount', v_declined);
END
$$;
REVOKE EXECUTE ON FUNCTION public.portal_authorize(text, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_authorize(text, jsonb, text, text, text, text) TO service_role;

-- Fixed-window counters store only a digest of the caller-provided subject.
CREATE TABLE public.api_rate_limits (
  bucket text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  PRIMARY KEY (bucket, subject_hash)
);
CREATE INDEX idx_api_rate_limits_window ON public.api_rate_limits(window_started_at);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_bucket text,
  p_subject text,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_window timestamptz;
  v_subject_hash text;
  v_count integer;
BEGIN
    IF p_bucket IS NULL OR p_bucket NOT IN ('portal_read', 'portal_authorize', 'whatsapp_webhook')
      OR coalesce(length(p_subject), 0) = 0
      OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
      OR p_max_requests IS NULL OR p_max_requests < 1 OR p_max_requests > 10000 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING DETAIL = 'Invalid rate-limit parameters';
  END IF;

  v_window := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_subject_hash := encode(extensions.digest(p_subject, 'sha256'), 'hex');

  INSERT INTO public.api_rate_limits AS current_limit (bucket, subject_hash, window_started_at, request_count)
  VALUES (p_bucket, v_subject_hash, v_window, 1)
  ON CONFLICT (bucket, subject_hash) DO UPDATE
  SET window_started_at = EXCLUDED.window_started_at,
      request_count = CASE
        WHEN current_limit.window_started_at <> EXCLUDED.window_started_at THEN 1
        ELSE current_limit.request_count + 1
      END
  RETURNING request_count INTO v_count;

  IF random() < 0.02 THEN
    DELETE FROM public.api_rate_limits
    WHERE window_started_at < clock_timestamp() - interval '2 days';
  END IF;

  RETURN v_count <= p_max_requests;
END
$$;
REVOKE EXECUTE ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, text, integer, integer) TO service_role;
