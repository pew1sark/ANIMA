import { useAuth } from '@/core/auth/AuthContext';
import { useTenant } from '@/core/tenant/TenantContext';
import { MODULES } from '@/core/modules/registry';
import type { ModuleSlug } from '@/types/core';

const ALL: ModuleSlug[] = ['core','crm','commerce','operations','delivery','food','creator','finance','agenda','support','ai'];

export function Panel() {
  const { user, isPlatformAdmin, signOut } = useAuth();
  const { memberships, current, modules, select } = useTenant();

  return (
    <div className="min-h-full">
      <header className="flex items-center gap-4 px-6 py-3 border-b border-line bg-surface/80 backdrop-blur sticky top-0">
        <span className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-[10px] grid place-items-center border border-line bg-sunk text-accent-deep">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3l7 4v10l-7 4-7-4V7zM12 8l3.5 2v4L12 16l-3.5-2v-4z" />
            </svg>
          </span>
          <span className="leading-tight">
            <b className="block text-[15px] font-extrabold tracking-tight">ANIMA</b>
            <span className="text-[10px] uppercase tracking-[.12em] font-extrabold text-accent-deep">Plataforma</span>
          </span>
        </span>
        <span className="ml-auto text-[13px] text-muted">{user?.email}</span>
        {isPlatformAdmin && (
          <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-accent/15 text-accent-deep">
            Super Admin
          </span>
        )}
        <button onClick={signOut}
          className="text-[13px] font-bold px-3.5 py-1.5 rounded-full border border-line hover:border-faint transition">
          Salir
        </button>
      </header>

      <main className="p-6 max-w-4xl mx-auto grid gap-6">
        <section>
          <h2 className="text-[10px] uppercase tracking-wider font-extrabold text-muted mb-3">
            Tus empresas · {memberships.length}
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {memberships.map(m => {
              const activa = current?.company.id === m.company.id;
              return (
                <button key={m.company.id} onClick={() => select(m.company.id)}
                  className={`text-left p-4 rounded-2xl border transition ${
                    activa ? 'border-accent bg-accent/8' : 'border-line bg-surface hover:border-faint'}`}>
                  <div className="flex items-center gap-2">
                    <b className="text-[15px] font-extrabold tracking-tight">{m.company.name}</b>
                    {activa && <span className="text-[10px] uppercase tracking-wider font-extrabold text-accent-deep">activa</span>}
                  </div>
                  <p className="text-[12px] text-muted mt-0.5">
                    {m.role.name} · nivel {m.role.level} · {m.company.currency} · /{m.company.slug}
                  </p>
                </button>
              );
            })}
            {memberships.length === 0 && (
              <p className="text-[13px] text-muted">No perteneces a ninguna empresa todavía.</p>
            )}
          </div>
        </section>

        {current && (
          <section>
            <h2 className="text-[10px] uppercase tracking-wider font-extrabold text-muted mb-3">
              Módulos en {current.company.name} · {modules.size} de {ALL.length}
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {ALL.map(slug => {
                const on = modules.has(slug);
                return (
                  <div key={slug}
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-[13px] ${
                      on ? 'border-line bg-surface' : 'border-line/60 bg-transparent text-faint'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-ok' : 'bg-faint/40'}`} />
                    <span className={on ? 'font-bold' : ''}>{MODULES[slug].name}</span>
                    {!on && <span className="ml-auto text-[10px] uppercase tracking-wider font-extrabold">off</span>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <p className="text-[11px] text-faint leading-relaxed border-t border-line pt-4">
          Esta lista no la filtra el navegador: la base solo devuelve las empresas de las que
          eres miembro. Un usuario de otra empresa, con esta misma pantalla, vería las suyas.
        </p>
      </main>
    </div>
  );
}
