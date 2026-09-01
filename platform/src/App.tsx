import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/core/auth/AuthContext';
import { TenantProvider, useTenant } from '@/core/tenant/TenantContext';
import { Login } from '@/components/Login';
import { Puertas, EntrandoAStudio } from '@/components/Puertas';
import { Elegir } from '@/components/Elegir';
import { Espacio } from '@/components/Espacio';
import { Consola } from '@/components/Consola';
import { env } from '@/config/env';

type Destino = 'company' | 'consola';

/* El portal es UNA sola puerta para todos:
     sin sesión   → entrar
     con sesión   → elegir sub-plataforma

   Qué puertas se abren NO lo decide esta pantalla: lo devuelve `mis_lineas()`,
   que lo deduce del plan contratado. Aquí solo se dibuja.

   STUDIO no vive en esta app: es el ANIMA de siempre (home.html), en el mismo
   origen y con la misma sesión de Supabase. COMPANY sí vive aquí.

   La consola es aparte. No es una tercera línea de producto ni un lugar donde
   se opere: es desde donde se mira el negocio del software. Por eso no cuelga
   de COMPANY —administrar el software no es operar una empresa— y no aparece
   dentro de ningún espacio de cliente. */
function Portal() {
  const { user, loading: authLoading, isPlatformAdmin } = useAuth();
  const { memberships, current, lineas, loading: tenantLoading, select } = useTenant();
  const [destino, setDestino] = useState<Destino | null>(null);

  const deCompany = memberships.filter(m => m.company.linea?.slug === 'company');

  const puedeStudio  = lineas.has('studio');
  const puedeCompany = lineas.has('company');
  /* Cuántos lugares distintos hay a los que ir. Con uno solo no se pregunta. */
  const puertas = (puedeStudio ? 1 : 0) + (puedeCompany ? 1 : 0) + (isPlatformAdmin ? 1 : 0);

  const abierto: Destino | null = destino ?? (
    puertas > 1 ? null : puedeCompany ? 'company' : isPlatformAdmin ? 'consola' : null
  );

  const activa = deCompany.find(m => m.company.id === current?.company.id) ?? null;
  /* Una sola organización: tampoco hay nada que elegir dentro de COMPANY. */
  const unica = deCompany.length === 1 ? deCompany[0]!.company.id : null;

  useEffect(() => {
    if (abierto === 'company' && !activa && unica) select(unica);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, activa?.company.id, unica]);

  if (authLoading || tenantLoading) return <Cargando />;
  if (!user) return <Login />;

  if (!abierto) {
    if (puertas === 0) return <SinAcceso />;
    if (puertas === 1 && puedeStudio) return <EntrandoAStudio />;
    return (
      <Puertas
        studio={puedeStudio ? irAStudio : undefined}
        company={puedeCompany ? () => setDestino('company') : undefined}
        consola={isPlatformAdmin ? () => setDestino('consola') : undefined}
      />
    );
  }

  const volver = puertas > 1
    ? () => { select(''); setDestino(null); }
    : undefined;

  // ---------------- La consola del software ----------------
  /* Quién entra lo protege RLS; esto solo decide qué se dibuja. */
  if (abierto === 'consola' && isPlatformAdmin) return <Consola volver={volver} />;

  // ---------------- ANIMA COMPANY ----------------
  if (deCompany.length === 0) return <SinOrganizacion volver={volver} />;
  if (!activa) {
    if (unica) return <Cargando />;   // el efecto de arriba la está abriendo
    return <Elegir organizaciones={deCompany} volver={volver} />;
  }
  return <Espacio volver={volver} />;
}

function irAStudio() { window.location.href = env.studio; }

const Cargando = () => (
  <div className="min-h-full grid place-items-center">
    <p className="text-[13px] text-muted">Cargando…</p>
  </div>
);

/* Ni Alma ni plan: la cuenta existe y no está en ningún lado. Es lo que ve
   alguien recién creado en Auth y en nada más. */
function SinAcceso() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Todavía no tienes acceso</h1>
        <p className="text-[14px] text-muted mt-2">
          Tu cuenta <b>{user?.email}</b> existe, pero todavía no tiene un plan ni un Alma.
          Quien te invitó tiene que darte de alta.
        </p>
        <button onClick={signOut}
          className="mt-6 text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
          Salir
        </button>
      </div>
    </div>
  );
}

/* El plan abre COMPANY, pero nadie lo agregó a la organización todavía. */
function SinOrganizacion({ volver }: { volver?: () => void }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Todavía no tienes acceso</h1>
        <p className="text-[14px] text-muted mt-2">
          Tu cuenta <b>{user?.email}</b> existe, pero aún no pertenece a ninguna organización
          de ANIMA COMPANY. Quien administra tu empresa tiene que invitarte.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {volver && (
            <button onClick={volver}
              className="text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
              Volver
            </button>
          )}
          <button onClick={signOut}
            className="text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
            Salir
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <Portal />
      </TenantProvider>
    </AuthProvider>
  );
}
