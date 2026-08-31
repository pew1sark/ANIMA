import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/core/auth/AuthContext';
import { TenantProvider, useTenant } from '@/core/tenant/TenantContext';
import { Login } from '@/components/Login';
import { Puertas, EntrandoAStudio } from '@/components/Puertas';
import { Elegir } from '@/components/Elegir';
import { Espacio } from '@/components/Espacio';
import { Consola } from '@/components/Consola';
import { env } from '@/config/env';

/* El portal es UNA sola puerta para todos:
     sin sesión   → entrar
     con sesión   → elegir sub-plataforma: STUDIO o COMPANY

   STUDIO no vive en esta app: es el ANIMA de siempre (home.html), en el mismo
   origen y con la misma sesión de Supabase, así que se cruza sin volver a
   entrar. COMPANY sí vive aquí: organizaciones, espacios y, para quien
   administra el software, la consola.

   Si solo hay una puerta abierta no se pregunta: nadie debería elegir cuando
   no hay elección. */
function Portal() {
  const { user, loading: authLoading, isPlatformAdmin, tieneAlma } = useAuth();
  const { memberships, current, loading: tenantLoading, select } = useTenant();
  const [puerta, setPuerta] = useState<'company' | null>(null);
  const [enConsola, setEnConsola] = useState(false);

  const deCompany = memberships.filter(m => m.company.linea?.slug === 'company');
  const deStudio  = memberships.filter(m => m.company.linea?.slug === 'studio');

  const puedeStudio  = tieneAlma || deStudio.length > 0;
  const puedeCompany = deCompany.length > 0 || isPlatformAdmin;

  /* Con una sola puerta se entra por ella. La elección no se guarda: vuelve a
     hacerse en cada sesión, porque son dos formas distintas de trabajar. */
  const abierta = puerta ?? (puedeStudio && puedeCompany ? null : puedeCompany ? 'company' : null);

  const activa = deCompany.find(m => m.company.id === current?.company.id) ?? null;
  /* Una sola organización y sin consola: tampoco hay nada que elegir. */
  const unica = deCompany.length === 1 && !isPlatformAdmin ? deCompany[0]!.company.id : null;

  useEffect(() => {
    if (abierta === 'company' && !activa && unica) select(unica);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, activa?.company.id, unica]);

  if (authLoading || tenantLoading) return <Cargando />;
  if (!user) return <Login />;

  if (!abierta) {
    if (puedeStudio && puedeCompany)
      return <Puertas irAStudio={irAStudio} irACompany={() => setPuerta('company')} />;
    if (puedeStudio) return <EntrandoAStudio />;
    return <SinAcceso />;
  }

  // ---------------- ANIMA COMPANY ----------------

  const volverAPuertas = puedeStudio
    ? () => { select(''); setEnConsola(false); setPuerta(null); }
    : undefined;

  /* La consola la protege RLS; esto solo decide qué se dibuja. */
  if (enConsola && isPlatformAdmin) return <Consola volver={() => setEnConsola(false)} />;

  const irAConsola = isPlatformAdmin ? () => setEnConsola(true) : undefined;

  if (deCompany.length === 0) return <SinOrganizacion irAConsola={irAConsola} volver={volverAPuertas} />;
  if (!activa) {
    if (unica) return <Cargando />;   // el efecto de arriba la está abriendo
    return <Elegir organizaciones={deCompany} irAConsola={irAConsola} volver={volverAPuertas} />;
  }
  return <Espacio irAConsola={irAConsola} volver={volverAPuertas} />;
}

function irAStudio() { window.location.href = env.studio; }

const Cargando = () => (
  <div className="min-h-full grid place-items-center">
    <p className="text-[13px] text-muted">Cargando…</p>
  </div>
);

/* Ni Alma ni organización: la cuenta existe y no está en ningún lado. Es lo
   que ve alguien recién dado de alta en Auth y en nada más. */
function SinAcceso() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Todavía no tienes acceso</h1>
        <p className="text-[14px] text-muted mt-2">
          Tu cuenta <b>{user?.email}</b> existe, pero aún no tiene un Alma ni pertenece
          a ninguna organización. Quien te invitó tiene que darte de alta.
        </p>
        <button onClick={signOut}
          className="mt-6 text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
          Salir
        </button>
      </div>
    </div>
  );
}

function SinOrganizacion({ irAConsola, volver }:
  { irAConsola?: () => void; volver?: () => void }) {
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
          {irAConsola && (
            <button onClick={irAConsola}
              className="text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg hover:opacity-90 transition">
              Ir a la consola
            </button>
          )}
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
