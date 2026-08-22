import { AuthProvider, useAuth } from '@/core/auth/AuthContext';
import { TenantProvider, useTenant } from '@/core/tenant/TenantContext';
import { MODULES } from '@/core/modules/registry';

/* Pantalla mínima de verificación: prueba que la cadena
   sesión → empresas → módulos funciona de extremo a extremo.
   Se reemplaza por el shell real en la siguiente fase. */
function Estado() {
  const { user, isPlatformAdmin, loading: authLoading } = useAuth();
  const { memberships, current, modules, loading, select } = useTenant();

  if (authLoading || loading) return <p style={{ padding: 24 }}>Cargando…</p>;
  if (!user) return <p style={{ padding: 24 }}>Sin sesión.</p>;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 720 }}>
      <h1>ANIMA · Plataforma</h1>
      <p>{user.email}{isPlatformAdmin && ' · Super Admin'}</p>

      <h2>Empresas</h2>
      <ul>
        {memberships.map(m => (
          <li key={m.company.id}>
            <button onClick={() => select(m.company.id)}>
              {m.company.name} — {m.role.name}{current?.company.id === m.company.id ? ' ◂ activa' : ''}
            </button>
          </li>
        ))}
      </ul>

      <h2>Módulos activos {current && `en ${current.company.name}`}</h2>
      <ul>
        {[...modules].map(slug => <li key={slug}>{MODULES[slug]?.name ?? slug}</li>)}
      </ul>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <Estado />
      </TenantProvider>
    </AuthProvider>
  );
}
