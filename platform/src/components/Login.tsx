import { useState, type FormEvent } from 'react';
import { useAuth } from '@/core/auth/AuthContext';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enPausa, setEnPausa] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setEnPausa(false);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      /* Una cuenta de la Alpha en pausa no es un error de quien entra: es un
         estado de ANIMA. Merece una explicación, no una línea roja. */
      if (/banned|pausa/i.test(msg)) { setEnPausa(true); }
      /* Para lo demás, mensaje genérico: no revelamos si el correo existe. */
      else setError(msg.includes('Invalid')
        ? 'Correo o contraseña incorrectos.'
        : 'No se pudo iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (enPausa) return <EnPausa volver={() => { setEnPausa(false); setPassword(''); }} />;

  return (
    <div className="min-h-full grid place-items-center p-6">
      <form onSubmit={submit}
        className="w-full max-w-sm bg-surface border border-line rounded-3xl p-8 shadow-[0_18px_50px_rgba(0,0,0,.06)]">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="w-8 h-8 rounded-[10px] grid place-items-center border border-line bg-sunk text-accent-deep">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3l7 4v10l-7 4-7-4V7zM12 8l3.5 2v4L12 16l-3.5-2v-4z" />
            </svg>
          </span>
          <div className="leading-tight">
            <b className="block text-[15px] font-extrabold tracking-tight">ANIMA</b>
            <span className="text-[10px] uppercase tracking-[.12em] font-extrabold text-accent-deep">Plataforma</span>
          </div>
        </div>

        <h1 className="text-xl font-extrabold tracking-tight mt-5">Entrar</h1>
        <p className="text-[13px] text-muted mt-1 mb-6">Accede con tu cuenta de la plataforma.</p>

        <label className="block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5">Correo</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          className="w-full mb-4 px-3.5 py-2.5 rounded-xl border border-line bg-sunk text-sm outline-none focus:border-accent" />

        <label className="block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5">Contraseña</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full mb-5 px-3.5 py-2.5 rounded-xl border border-line bg-sunk text-sm outline-none focus:border-accent" />

        {error && (
          <p role="alert" className="text-[13px] text-danger bg-danger/10 border border-danger/20 rounded-xl px-3.5 py-2.5 mb-4">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy}
          className="w-full py-2.5 rounded-full bg-ink text-bg text-sm font-bold disabled:opacity-45 hover:-translate-y-px transition">
          {busy ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-[11px] text-faint mt-5 leading-relaxed">
          Lo que ves después de entrar lo decide PostgreSQL con RLS, no esta pantalla.
        </p>
      </form>
    </div>
  );
}

/* Lo que ve un Alma de la Alpha. Se le dice lo único que de verdad le importa:
   que no se borró nada suyo, y cuándo vuelve. Sin pedir disculpas y sin
   prometer fechas que no existen. */
function EnPausa({ volver }: { volver: () => void }) {
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="w-full max-w-md bg-surface border border-line rounded-3xl p-8 shadow-[0_18px_50px_rgba(0,0,0,.06)]">
        <div className="flex items-center gap-2.5 mb-6">
          <span className="w-8 h-8 rounded-[10px] grid place-items-center border border-line bg-sunk text-accent-deep">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3l7 4v10l-7 4-7-4V7zM12 8l3.5 2v4L12 16l-3.5-2v-4z" />
            </svg>
          </span>
          <div className="leading-tight">
            <b className="block text-[15px] font-extrabold tracking-tight">ANIMA</b>
            <span className="text-[10px] uppercase tracking-[.12em] font-extrabold text-accent-deep">Plataforma</span>
          </div>
        </div>

        <h1 className="text-[22px] font-extrabold tracking-tight leading-tight">
          Tu Alma está guardada.<br />El ingreso, en pausa.
        </h1>

        <p className="text-[13.5px] text-ink-2 mt-3 leading-relaxed">
          ANIMA está cambiando de piel: lo que empezó como la Alpha se está
          convirtiendo en la plataforma.
        </p>

        <p className="text-[13.5px] text-ink-2 mt-3 leading-relaxed">
          <b>No se borró nada tuyo.</b> Tu trayectoria, tus insignias, tu portafolio
          y tus huellas en el Árbol siguen exactamente donde las dejaste. Cuando
          vuelvas a entrar, van a estar ahí.
        </p>

        <p className="text-[13.5px] text-muted mt-3 leading-relaxed">
          El acceso se está reabriendo de a poco, por invitación. Si quieres estar
          entre los primeros, escríbele a SARK.
        </p>

        <div className="flex items-center gap-3 mt-7">
          <button onClick={volver}
            className="text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
            Volver
          </button>
          <a href="/ANIMA/" className="text-[13px] text-muted hover:text-ink transition">
            Ir a anima.
          </a>
        </div>
      </div>
    </div>
  );
}
