/* Tipos del núcleo de plataforma. Espejo de la migración 0040. */
export type CompanyStatus = 'trial' | 'active' | 'suspended' | 'cancelled';
export type MemberStatus  = 'invited' | 'active' | 'suspended';
export type RoleScope     = 'platform' | 'company';

/** Niveles de autoridad. Se comparan con >=, nunca por slug. */
export const ROLE_LEVEL = {
  owner: 100, admin: 80, manager: 60, employee: 40, viewer: 20
} as const;
export type RoleSlug = keyof typeof ROLE_LEVEL;

export type ModuleSlug =
  | 'core' | 'crm' | 'commerce' | 'operations' | 'delivery'
  | 'food' | 'creator' | 'finance' | 'agenda' | 'support' | 'ai';

/** Las dos sub-plataformas de ANIMA. Una organización pertenece a una.
 *  Espejo de la tabla `product_lines` (migración 0067). */
export type ProductLine = 'studio' | 'company';

/** De quién son los datos que la organización administra (migración 0068).
 *  `operator`: los suyos. `advisor`: los de sus clientes.
 *  Es un eje distinto al de la línea: un asesor puede estar en COMPANY. */
export type TenantType = 'operator' | 'advisor';

export interface ProductLineInfo { slug: ProductLine; name: string; }

export const PRODUCT_LINES: Record<ProductLine, ProductLineInfo> = {
  studio:  { slug: 'studio',  name: 'ANIMA STUDIO'  },
  company: { slug: 'company', name: 'ANIMA COMPANY' }
} as const;

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  tenant_type: TenantType;
  country: string;
  currency: string;
  timezone: string;
  locale: string;
  /** La sub-plataforma a la que pertenece. Viene incrustada desde
   *  `product_lines`; puede faltar si la organización aún no tiene línea. */
  linea?: ProductLineInfo | null;
  /** Lo que el cliente puede adaptar a su marca. Ver services/marca.service. */
  branding: { logo_url?: string | null; color?: string | null } | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface Role { id: string; slug: RoleSlug | 'platform_admin'; name: string; scope: RoleScope; level: number; }

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role_id: string;
  status: MemberStatus;
  role?: Role;
}

export interface Membership { company: Company; role: Role; status: MemberStatus; }

export interface AuditEntry {
  company_id: string | null;
  user_id: string | null;
  action: string;
  entity?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
}
