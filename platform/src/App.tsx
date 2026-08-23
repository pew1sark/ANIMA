import { AuthProvider, useAuth } from '@/core/auth/AuthContext';
import { TenantProvider, useTenant } from '@/core/tenant/TenantContext';
import { Login } from '@/components/Login';
import { Panel } from '@/components/Panel';

function Ruta() {
  const { user, loading: authLoading } = useAuth();
  const { loading: tenantLoading } = useTenant();

  if (authLoading) return <Cargando />;
  if (!user) return <Login />;
  if (tenantLoading) return <Cargando />;
  return <Panel />;
}

const Cargando = () => (
  <div className="min-h-full grid place-items-center">
    <p className="text-[13px] text-muted">Cargando…</p>
  </div>
);

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <Ruta />
      </TenantProvider>
    </AuthProvider>
  );
}
