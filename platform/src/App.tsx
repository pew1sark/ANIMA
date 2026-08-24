import { AuthProvider, useAuth } from '@/core/auth/AuthContext';
import { TenantProvider, useTenant } from '@/core/tenant/TenantContext';
import { Login } from '@/components/Login';
import { Elegir } from '@/components/Elegir';
import { Espacio } from '@/components/Espacio';

/* El portal es UNA sola puerta para todos:
     sin sesión        → entrar
     una organización  → directo a su espacio
     varias            → elegir cuál
   La experiencia de adentro la decide la organización, no el código. */
function Portal() {
  const { user, loading: authLoading } = useAuth();
  const { memberships, current, loading: tenantLoading } = useTenant();

  if (authLoading) return <Cargando />;
  if (!user) return <Login />;
  if (tenantLoading) return <Cargando />;

  if (memberships.length === 0) return <SinOrganizacion />;
  if (!current) return <Elegir />;
  return <Espacio />;
}

const Cargando = () => (
  <div className="min-h-full grid place-items-center">
    <p className="text-[13px] text-muted">Cargando…</p>
  </div>
);

function SinOrganizacion() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Todavía no tienes acceso</h1>
        <p className="text-[14px] text-muted mt-2">
          Tu cuenta <b>{user?.email}</b> existe, pero aún no pertenece a ninguna organización.
          Quien administra tu empresa tiene que invitarte.
        </p>
        <button onClick={signOut}
          className="mt-6 text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
          Salir
        </button>
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
