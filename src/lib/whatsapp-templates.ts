export type TemplateKey = "status_update" | "checked_in" | "dvi_ready" | "vehicle_ready";

export const shouldSendLiveWhatsApp = (mode: string | undefined): boolean => mode === "live";

export interface TemplateDefinition {
  metaName: string;
  language: string;
  manual: boolean;
  dedupe?: "once" | "none";
  vars: string[];
  secretVars?: string[];
  bodyPattern: string;
  buttonUrlIndex?: number;
  label: string;
}

export const TEMPLATES: Record<TemplateKey, TemplateDefinition> = {
  status_update: {
    label: "Status update",
    metaName: "shopos_status_update",
    language: "en_US",
    manual: true,
    vars: ["customer_name", "shop_name", "vehicle", "update", "shop_phone"],
    bodyPattern:
      "Hi {{customer_name}}, an update from {{shop_name}} on your {{vehicle}}: {{update}}. Questions? Call {{shop_phone}}.",
  },
  checked_in: {
    label: "Checked in",
    metaName: "shopos_checked_in",
    language: "en_US",
    manual: false,
    dedupe: "once",
    vars: ["customer_name", "shop_name", "vehicle", "shop_phone"],
    bodyPattern:
      "Hi {{customer_name}}, {{shop_name}} has checked in your {{vehicle}}. We will send updates as work progresses. Questions? Call {{shop_phone}}.",
  },
  dvi_ready: {
    label: "Inspection ready",
    metaName: "shopos_dvi_ready",
    language: "en_US",
    manual: false,
    dedupe: "once",
    vars: ["customer_name", "shop_name", "vehicle", "shop_phone", "portal_token"],
    secretVars: ["portal_token"],
    buttonUrlIndex: 0,
    bodyPattern:
      "Hi {{customer_name}}, {{shop_name}} completed the digital inspection on your {{vehicle}}. Please review and authorize findings. Questions? Call {{shop_phone}}.",
  },
  vehicle_ready: {
    label: "Vehicle ready",
    metaName: "shopos_vehicle_ready",
    language: "en_US",
    manual: false,
    dedupe: "once",
    vars: ["customer_name", "shop_name", "vehicle", "shop_phone"],
    bodyPattern:
      "Hi {{customer_name}}, your {{vehicle}} is ready for pickup at {{shop_name}}! Questions? Call {{shop_phone}}.",
  },
};

/** Meta Cloud API rules: no newlines/tabs, no runs of spaces, not empty. */
export function sanitizeVar(val: unknown): string {
  if (val == null) throw new Error("Template variable cannot be empty");
  const str = String(val)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  if (!str.length) throw new Error("Template variable cannot be empty");
  return str;
}

export function renderPreview(key: TemplateKey, vars: Record<string, string>): string {
  const def = TEMPLATES[key];
  return def.bodyPattern.replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
    vars[k] != null && String(vars[k]).trim() ? sanitizeVar(vars[k]) : `{{${k}}}`,
  );
}

export function buildComponents(key: TemplateKey, vars: Record<string, string>) {
  const def = TEMPLATES[key];
  const bodyVars = def.vars.filter((v) => !def.secretVars?.includes(v));
  const components: Array<Record<string, unknown>> = [
    {
      type: "body",
      parameters: bodyVars.map((v) => ({ type: "text", text: sanitizeVar(vars[v]) })),
    },
  ];
  const secretKey = def.secretVars?.[0];
  if (def.buttonUrlIndex != null && secretKey && vars[secretKey]) {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(def.buttonUrlIndex),
      parameters: [{ type: "text", text: sanitizeVar(vars[secretKey]) }],
    });
  }
  return components;
}

/** Status code → automatic milestone template (checked in / vehicle ready). */
export function milestoneTemplateFor(
  statusCode: string,
  isTerminal: boolean,
  overrides: Record<string, string> = {},
): TemplateKey | null {
  if (overrides[statusCode]) return overrides[statusCode] as TemplateKey;
  const code = statusCode.toUpperCase();
  if (code === "CHECKED_IN" || code === "1") return "checked_in";
  if (
    code === "COMPLETED_READY" ||
    code === "7" ||
    (isTerminal && code !== "CANCELLED" && code !== "VOID")
  )
    return "vehicle_ready";
  return null;
}
