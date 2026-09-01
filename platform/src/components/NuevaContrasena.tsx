import { useState, type FormEvent } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca } from '@/components/Marca';
import { accesoService } from '@/services/acceso.service';

/* Se llega aquí solo desde el enlace del correo. Hay sesión, pero todavía no se
   entra a ninguna parte: primero la contraseña nueva. */
export function NuevaContrasena() {
  const { terminarRecuperacion, signOut } = useAuth();
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (clave.length < 8) { setError('Usa al menos 8 caracteres.'); return; }
    if (clave !== repetida) { setError('Las dos contraseñas no coinciden.'); return; }
    setBusy(true); setError(null);
    try {
      await accesoService.fijarContrasena(clave);
      /* Se limpia el hash del enlace para que recargar no vuelva a esta
         pantalla, y se sigue adentro con la sesión ya válida. */
      history.replaceState(null, '', location.pathname + location.search);
      terminarRecuperacion();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la contraseña.');
      setBusy(false);
    }
  }

  const campo = `w-full px-3.5 py-2.5 rounded-xl border border-line bg-sunk text-sm
                 outline-none focus:border-accent transition`;
  const etiqueta = 'block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5';

  return (
    <div className="min-h-full grid place-items-center p-6">
      <form onSubmit={submit}
        className="w-full max-w-[420px] aparece bg-surface border border-line rounded-3xl p-8
                   shadow-[0_18px_50px_rgba(0,0,0,.06)]">
        <Marca />
        <h1 className="text-[22px] font-extrabold tracking-tight mt-7">Nueva contraseña</h1>
        <p className="text-[13px] text-muted mt-1.5 mb-6 leading-relaxed">
          Elige una que no uses en otra parte. Con esto entras a ANIMA TSC.
        </p>

        <label className={etiqueta}>Contraseña</label>
        <input type="password" required autoFocus value={clave} onChange={e => setClave(e.target.value)}
               autoComplete="new-password" className={campo + ' mb-4'} />

        <label className={etiqueta}>Repítela</label>
        <input type="password" required value={repetida} onChange={e => setRepetida(e.target.value)}
               autoComplete="new-password" className={campo + ' mb-5'} />

        {error && (
          <p role="alert" className="entra text-[13px] text-danger bg-danger/10 border border-danger/20
                                     rounded-xl px-3.5 py-2.5 mb-4">{error}</p>
        )}

        <button type="submit" disabled={busy}
          className="w-full py-2.5 rounded-full bg-ink text-bg text-sm font-bold
                     disabled:opacity-45 hover:opacity-90 transition">
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </button>
        <button type="button" onClick={signOut}
          className="w-full mt-3 text-[12.5px] text-muted hover:text-ink transition">
          Cancelar
        </button>
      </form>
    </div>
  );
}
