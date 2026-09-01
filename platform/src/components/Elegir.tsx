import { useTenant } from '@/core/tenant/TenantContext';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca } from '@/components/Marca';
import type { Membership } from '@/types/core';

/* Las organizaciones de ANIMA COMPANY. La lista llega filtrada por línea: el
   portal ya decidió por qué puerta se entró. Con una sola —y sin consola— el
   portal entra directo: nadie debería elegir cuando no hay elección. */
export function Elegir({ organizaciones, volver }:
  { organizaciones: Membership[]; volver?: () => void }) {
  const { select } = useTenant();
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="w-full max-w-lg aparece">
        <div className="flex items-center justify-between mb-7">
          <Marca sub="Company" />
          <span className="flex items-center gap-4">
            {volver && (
              <button onClick={volver} className="text-[13px] text-muted hover:text-ink transition">
                ← Cambiar de puerta
              </button>
            )}
            <button onClick={signOut} className="text-[13px] text-muted hover:text-ink transition">Salir</button>
          </span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">¿Dónde quieres entrar?</h1>
        <p className="text-[13px] text-muted mt-1 mb-6">{user?.email}</p>
        <div className="grid gap-2.5">
          {organizaciones.map(m => (
            <button key={m.company.id} onClick={() => select(m.company.id)}
              className="text-left p-4 rounded-2xl border border-line bg-surface hover:border-accent toque group">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl grid place-items-center bg-accent/12 text-accent-deep
                                 font-extrabold text-[15px] shrink-0">
                  {m.company.name.slice(0,2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <b className="block text-[15px] font-extrabold tracking-tight truncate">{m.company.name}</b>
                  <span className="text-[12px] text-muted">{m.role.name} · {m.company.currency}</span>
                </span>
                <span className="ml-auto text-faint group-hover:text-accent transition">→</span>
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
