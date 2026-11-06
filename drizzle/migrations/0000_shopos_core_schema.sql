
CREATE TYPE public.app_role AS ENUM ('mso_admin','owner','advisor','technician','parts_specialist');

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_tier text NOT NULL DEFAULT 'enterprise',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  subdomain text UNIQUE NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  shop_mode smallint NOT NULL DEFAULT 2 CHECK (shop_mode IN (2,6)),
  phone_number text,
  whatsapp_phone_number_id text UNIQUE,
  feature_flags jsonb NOT NULL DEFAULT '{"require_dvi": false, "whatsapp_milestones": true}',
  address jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone_number text,
  is_active boolean NOT NULL DEFAULT true,
  legacy_user_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_shop ON public.profiles(shop_id);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id)
);
CREATE TABLE public.staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  role public.app_role NOT NULL,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_staff_invites_email ON public.staff_invites(lower(email));

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone_mobile text NOT NULL,
  phone_alternate text,
  whatsapp_opt_in boolean NOT NULL DEFAULT false,
  whatsapp_opt_in_at timestamptz,
  whatsapp_opt_in_source text,
  whatsapp_opted_out_at timestamptz,
  communication_preferences jsonb NOT NULL DEFAULT '{"email": true}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_phone ON public.customers(shop_id, phone_mobile);
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  vin text, year int NOT NULL, make text NOT NULL, model text NOT NULL,
  submodel text, engine text, license_plate text, odometer_in int, unit_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.status_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  status_code text NOT NULL,
  label text NOT NULL,
  color_hex text NOT NULL,
  time_select_mode smallint NOT NULL DEFAULT 1 CHECK (time_select_mode IN (1,2,4)),
  default_duration_minutes int NOT NULL DEFAULT 0,
  cooldown_seconds int NOT NULL DEFAULT 15,
  requires_parts_vendor boolean NOT NULL DEFAULT false,
  requires_qc_signoff boolean NOT NULL DEFAULT false,
  requires_dvi_complete boolean NOT NULL DEFAULT false,
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, status_code),
  UNIQUE (shop_id, step_order) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE public.bays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  bay_type text NOT NULL DEFAULT 'general' CHECK (bay_type IN ('general','alignment','lift','wash')),
  display_order int NOT NULL DEFAULT 0,
  UNIQUE (shop_id, name)
);
CREATE TABLE public.parts_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL, phone text, is_active boolean NOT NULL DEFAULT true,
  UNIQUE (shop_id, name)
);
CREATE TABLE public.ro_sequences (
  shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  next_value bigint NOT NULL DEFAULT 1000
);
CREATE TABLE public.repair_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  ro_number text NOT NULL,
  invoice_number text, stock_number text, keytag text, concern text,
  current_status_id uuid NOT NULL REFERENCES public.status_pipelines(id),
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  eta_due_at timestamptz,
  wait_type text NOT NULL DEFAULT 'dropoff' CHECK (wait_type IN ('waiting','dropoff','shuttle','loaner','tow')),
  bay_id uuid REFERENCES public.bays(id) ON DELETE SET NULL,
  service_advisor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_technician_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  parts_vendor_id uuid REFERENCES public.parts_vendors(id) ON DELETE SET NULL,
  dvi_status text NOT NULL DEFAULT 'not_started' CHECK (dvi_status IN ('not_started','in_progress','sent','approved')),
  qc_status text NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending','passed','failed')),
  is_archived boolean NOT NULL DEFAULT false,
  row_version int NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, ro_number)
);
CREATE INDEX idx_ro_shop_active ON public.repair_orders(shop_id, is_archived, current_status_id);

CREATE TABLE public.dvi_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  title text NOT NULL, categories jsonb NOT NULL, is_default boolean NOT NULL DEFAULT false
);
CREATE TABLE public.dvi_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  repair_order_id uuid NOT NULL REFERENCES public.repair_orders(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.dvi_templates(id),
  technician_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  access_token_hash text UNIQUE,
  access_token_expires_at timestamptz,
  submitted_at timestamptz,
  sent_at timestamptz,
  customer_viewed_at timestamptz,
  customer_authorized_at timestamptz,
  customer_signature_key text,
  customer_ip_address text,
  customer_user_agent text,
  consent_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repair_order_id, template_id)
);
CREATE TABLE public.dvi_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  dvi_id uuid NOT NULL REFERENCES public.dvi_inspections(id) ON DELETE CASCADE,
  category text NOT NULL, title text NOT NULL,
  condition text NOT NULL CHECK (condition IN ('green','yellow','red')),
  technician_notes text,
  estimated_cost numeric(10,2) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  customer_approved boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dvi_items_dvi ON public.dvi_items(dvi_id);
CREATE TABLE public.dvi_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  dvi_item_id uuid NOT NULL REFERENCES public.dvi_items(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video')),
  content_type text NOT NULL,
  byte_size bigint NOT NULL,
  annotation_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  repair_order_id uuid REFERENCES public.repair_orders(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  sender_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  template_key text NOT NULL,
  template_vars jsonb NOT NULL DEFAULT '{}',
  body text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued','sent','delivered','read','failed')),
  provider_message_id text UNIQUE,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_customer ON public.messages(shop_id, customer_id, created_at DESC);
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL, event_id text NOT NULL, shop_id uuid,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  UNIQUE (provider, event_id)
);
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  repair_order_id uuid REFERENCES public.repair_orders(id) ON DELETE SET NULL,
  user_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_order ON public.audit_events(repair_order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_ro_touch BEFORE UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_cust_touch BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_veh_touch BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dvi_touch BEFORE UPDATE ON public.dvi_inspections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_dvi_items_touch BEFORE UPDATE ON public.dvi_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_shops_touch BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.current_shop_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT shop_id FROM public.profiles WHERE id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.role_permissions(_role public.app_role) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _role
    WHEN 'advisor' THEN ARRAY['board.view','ro.create','ro.transition','ro.assign_bay','ro.archive','dvi.view','dvi.edit','dvi.send','qc.signoff','messages.view','messages.send','customers.consent','settings.shop','settings.pipeline','reports.shop']
    WHEN 'technician' THEN ARRAY['board.view','ro.transition','dvi.view','dvi.edit','qc.signoff']
    WHEN 'parts_specialist' THEN ARRAY['board.view','parts.manage','ro.transition']
    WHEN 'owner' THEN ARRAY['board.view','ro.create','ro.transition','ro.assign_bay','ro.archive','dvi.view','dvi.edit','dvi.send','qc.signoff','messages.view','messages.send','customers.consent','settings.shop','settings.pipeline','reports.shop','parts.manage','ro.reopen','staff.manage']
    WHEN 'mso_admin' THEN ARRAY['board.view','ro.create','ro.transition','ro.assign_bay','ro.archive','dvi.view','dvi.edit','dvi.send','qc.signoff','messages.view','messages.send','customers.consent','settings.shop','settings.pipeline','reports.shop','parts.manage','ro.reopen','staff.manage','reports.mso']
  END
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid() AND p.is_active AND ur.shop_id = p.shop_id
      AND _perm = ANY(public.role_permissions(ur.role))
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.require_permission(_perm text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid := public.current_shop_id();
BEGIN
  IF v_shop IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING DETAIL = 'Sign in required'; END IF;
  IF NOT public.has_permission(_perm) THEN RAISE EXCEPTION 'FORBIDDEN' USING DETAIL = 'You do not have permission: ' || _perm; END IF;
  RETURN v_shop;
END $$;

GRANT SELECT ON public.tenants, public.user_roles, public.audit_events, public.ro_sequences, public.repair_orders, public.dvi_inspections, public.messages TO authenticated;
GRANT SELECT, UPDATE ON public.shops, public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invites, public.customers, public.vehicles, public.status_pipelines, public.bays, public.parts_vendors, public.dvi_templates, public.dvi_items, public.dvi_media TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ro_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dvi_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dvi_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dvi_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dvi_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_read ON public.tenants FOR SELECT TO authenticated
  USING (id = (SELECT tenant_id FROM public.shops WHERE id = public.current_shop_id()));
CREATE POLICY shop_read ON public.shops FOR SELECT TO authenticated USING (id = public.current_shop_id());
CREATE POLICY shop_update ON public.shops FOR UPDATE TO authenticated
  USING (id = public.current_shop_id() AND public.has_permission('settings.shop'))
  WITH CHECK (id = public.current_shop_id());
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (shop_id = public.current_shop_id() OR id = auth.uid());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR (shop_id = public.current_shop_id() AND public.has_permission('staff.manage')))
  WITH CHECK (shop_id = public.current_shop_id());
CREATE POLICY roles_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR shop_id = public.current_shop_id());
CREATE POLICY invites_manage ON public.staff_invites FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id() AND public.has_permission('staff.manage'))
  WITH CHECK (shop_id = public.current_shop_id() AND public.has_permission('staff.manage'));

CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (shop_id = public.current_shop_id() AND public.has_permission('ro.create'));
CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated
  USING (shop_id = public.current_shop_id() AND (public.has_permission('ro.create') OR public.has_permission('customers.consent')))
  WITH CHECK (shop_id = public.current_shop_id());
CREATE POLICY vehicles_read ON public.vehicles FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY vehicles_write ON public.vehicles FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id() AND public.has_permission('ro.create'))
  WITH CHECK (shop_id = public.current_shop_id() AND public.has_permission('ro.create'));

CREATE POLICY pipeline_read ON public.status_pipelines FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY pipeline_write ON public.status_pipelines FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id() AND public.has_permission('settings.pipeline'))
  WITH CHECK (shop_id = public.current_shop_id() AND public.has_permission('settings.pipeline'));
CREATE POLICY bays_read ON public.bays FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY bays_write ON public.bays FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id() AND public.has_permission('settings.shop'))
  WITH CHECK (shop_id = public.current_shop_id() AND public.has_permission('settings.shop'));
CREATE POLICY vendors_read ON public.parts_vendors FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY vendors_write ON public.parts_vendors FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id() AND (public.has_permission('settings.shop') OR public.has_permission('parts.manage')))
  WITH CHECK (shop_id = public.current_shop_id() AND (public.has_permission('settings.shop') OR public.has_permission('parts.manage')));
CREATE POLICY seq_read ON public.ro_sequences FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY ro_read ON public.repair_orders FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());

CREATE POLICY tpl_read ON public.dvi_templates FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY tpl_write ON public.dvi_templates FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id() AND public.has_permission('settings.shop'))
  WITH CHECK (shop_id = public.current_shop_id() AND public.has_permission('settings.shop'));
CREATE POLICY dvi_read ON public.dvi_inspections FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY items_read ON public.dvi_items FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY items_write ON public.dvi_items FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id() AND public.has_permission('dvi.edit')
    AND NOT EXISTS (SELECT 1 FROM public.dvi_inspections d WHERE d.id = dvi_id AND d.customer_authorized_at IS NOT NULL))
  WITH CHECK (shop_id = public.current_shop_id() AND public.has_permission('dvi.edit')
    AND EXISTS (SELECT 1 FROM public.dvi_inspections d WHERE d.id = dvi_id AND d.shop_id = public.current_shop_id() AND d.customer_authorized_at IS NULL));
CREATE POLICY media_read ON public.dvi_media FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());
CREATE POLICY media_write ON public.dvi_media FOR ALL TO authenticated
  USING (shop_id = public.current_shop_id() AND public.has_permission('dvi.edit'))
  WITH CHECK (shop_id = public.current_shop_id() AND public.has_permission('dvi.edit')
    AND EXISTS (SELECT 1 FROM public.dvi_items i WHERE i.id = dvi_item_id AND i.shop_id = public.current_shop_id()));
CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated USING (shop_id = public.current_shop_id() AND public.has_permission('messages.view'));
CREATE POLICY audit_read ON public.audit_events FOR SELECT TO authenticated USING (shop_id = public.current_shop_id());

CREATE VIEW public.board_orders WITH (security_invoker = on) AS
SELECT ro.id, ro.shop_id, ro.ro_number, ro.concern, ro.keytag, ro.wait_type,
  ro.current_status_id, ro.status_updated_at, ro.eta_due_at, ro.bay_id, ro.parts_vendor_id,
  ro.service_advisor_id, ro.assigned_technician_id,
  ro.dvi_status, ro.qc_status, ro.is_archived, ro.row_version, ro.created_at,
  c.id AS customer_id, c.first_name AS customer_first_name, c.last_name AS customer_last_name,
  c.phone_mobile AS customer_phone, c.whatsapp_opt_in,
  v.id AS vehicle_id, v.year AS vehicle_year, v.make AS vehicle_make, v.model AS vehicle_model,
  v.license_plate, v.vin
FROM public.repair_orders ro
JOIN public.customers c ON c.id = ro.customer_id
JOIN public.vehicles v ON v.id = ro.vehicle_id;
GRANT SELECT ON public.board_orders TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dvi_inspections;
