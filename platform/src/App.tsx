import { useState } from 'react';
import { AuthProvider, useAuth } from '@/core/auth/AuthContext';
import { TenantProvider, useTenant } from '@/core/tenant/TenantContext';
import { Login } from '@/components/Login';
import { Elegir } from '@/components/Elegir';
import { Espacio } from '@/components/Espacio';
import { Consola } from '@/components/Consola';

/* El portal es UNA sola puerta para todos:
     sin sesión        → entrar
     una organización  → directo a su espacio
     varias            → elegir cuál
   La experiencia de adentro la decide la organización, no el código.

   Y aparte, para quien administra la plataforma, la consola: el negocio del
   software. Es un lugar distinto a propósito — administrar clientes no es
   trabajar dentro de una organización. */
function Portal() {
  const { user, loading: authLoading, isPlatformAdmin } = useAuth();
  const { memberships, current, loading: tenantLoading } = useTenant();
  const [enConsola, setEnConsola] = useState(false);

  if (authLoading) return <Cargando />;
  if (!user) return <Login />;
  if (tenantLoading) return <Cargando />;

  /* La consola la protege RLS; esto solo decide qué se dibuja. */
  if (enConsola && isPlatformAdmin) return <Consola volver={() => setEnConsola(false)} />;

  const irAConsola = isPlatformAdmin ? () => setEnConsola(true) : undefined;

  if (memberships.length === 0) return <SinOrganizacion irAConsola={irAConsola} />;
  if (!current) return <Elegir irAConsola={irAConsola} />;
  return <Espacio irAConsola={irAConsola} />;
}

const Cargando = () => (
  <div className="min-h-full grid place-items-center">
    <p className="text-[13px] text-muted">Cargando…</p>
  </div>
);

function SinOrganizacion({ irAConsola }: { irAConsola?: () => void }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Todavía no tienes acceso</h1>
        <p className="text-[14px] text-muted mt-2">
          Tu cuenta <b>{user?.email}</b> existe, pero aún no pertenece a ninguna organización.
          Quien administra tu empresa tiene que invitarte.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          {irAConsola && (
            <button onClick={irAConsola}
              className="text-[13px] font-bold px-4 py-2 rounded-full bg-ink text-bg hover:opacity-90 transition">
              Ir a la consola
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
