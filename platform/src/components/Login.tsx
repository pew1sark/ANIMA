import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca, Apex } from '@/components/Marca';
import { accesoService } from '@/services/acceso.service';
import { env } from '@/config/env';

type Vista = 'entrar' | 'recuperar' | 'solicitar' | 'pausa';

/* La puerta de ANIMA TSC. Tres cosas se pueden hacer sin cuenta: entrar,
   recuperar la contraseña y pedir acceso. Registrarse solo NO es una de ellas:
   las cuentas se abren por invitación. */
export function Login() {
  const [vista, setVista] = useState<Vista>('entrar');

  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="w-full max-w-[420px] aparece">
        <Tarjeta>
          {vista === 'entrar'    && <Entrar irA={setVista} />}
          {vista === 'recuperar' && <Recuperar volver={() => setVista('entrar')} />}
          {vista === 'solicitar' && <Solicitar volver={() => setVista('entrar')} />}
          {vista === 'pausa'     && <EnPausa volver={() => setVista('entrar')} />}
        </Tarjeta>

        <p className="text-center text-[10.5px] text-faint mt-5 leading-relaxed">
          <a href={env.sitio} className="hover:text-muted transition">ANIMA TSC</a>
          {' · '}
          <a href={env.sitio + 'legal.html#terminos'} className="hover:text-muted transition">Términos</a>
          {' · '}
          <a href={env.sitio + 'legal.html#privacidad'} className="hover:text-muted transition">Privacidad</a>
        </p>
      </div>
    </div>
  );
}

const Tarjeta = ({ children }: { children: ReactNode }) => (
  <div className="bg-surface border border-line rounded-3xl p-8 shadow-[0_18px_50px_rgba(0,0,0,.06)]">
    {children}
  </div>
);

const Cabecera = ({ titulo, texto }: { titulo: string; texto: string }) => (
  <>
    <Marca />
    <h1 className="text-[22px] font-extrabold tracking-tight mt-7">{titulo}</h1>
    <p className="text-[13px] text-muted mt-1.5 mb-6 leading-relaxed">{texto}</p>
  </>
);

const campo = `w-full px-3.5 py-2.5 rounded-xl border border-line bg-sunk text-sm
               outline-none focus:border-accent transition`;
const etiqueta = 'block text-[10px] uppercase tracking-wider font-extrabold text-muted mb-1.5';
const principal = `w-full py-2.5 rounded-full bg-ink text-bg text-sm font-bold
                   disabled:opacity-45 hover:opacity-90 transition`;

const Aviso = ({ tipo, children }: { tipo: 'mal' | 'bien'; children: ReactNode }) => (
  <p role="alert" className={`entra text-[13px] rounded-xl px-3.5 py-2.5 mb-4 border ${
    tipo === 'mal'
      ? 'text-danger bg-danger/10 border-danger/20'
      : 'text-ok bg-ok/10 border-ok/20'}`}>
    {children}
  </p>
);

// ---------------------------------------------------------------- entrar

function Entrar({ irA }: { irA: (v: Vista) => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      /* Una cuenta de la Alpha en pausa no es un error de quien entra: es un
         estado de ANIMA. Merece una explicación, no una línea roja. */
      if (/banned|pausa/i.test(msg)) { irA('pausa'); }
      /* Para lo demás, mensaje genérico: no revelamos si el correo existe. */
      else setError(msg.includes('Invalid')
        ? 'Correo o contraseña incorrectos.'
        : 'No se pudo iniciar sesión. Inténtalo de nuevo.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Cabecera titulo="Entrar" texto="Accede con tu cuenta de ANIMA TSC." />

      <label className={etiqueta}>Correo</label>
      <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
             autoComplete="email" className={campo + ' mb-4'} />

      <div className="flex items-baseline justify-between">
        <label className={etiqueta}>Contraseña</label>
        <button type="button" onClick={() => irA('recuperar')}
                className="text-[11.5px] font-bold text-accent-deep hover:underline mb-1.5">
          ¿La olvidaste?
        </button>
      </div>
      <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
             autoComplete="current-password" className={campo + ' mb-5'} />

      {error && <Aviso tipo="mal">{error}</Aviso>}

      <button type="submit" disabled={busy} className={principal}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>

      <div className="h-px bg-line my-6" />

      <p className="text-[12.5px] text-muted leading-relaxed">
        ANIMA TSC se entrega con acompañamiento: las cuentas se abren por invitación,
        no con un registro.{' '}
        <button type="button" onClick={() => irA('solicitar')}
                className="font-bold text-accent-deep hover:underline">
          Pedir acceso →
        </button>
      </p>
    </form>
  );
}

// ------------------------------------------------------------- recuperar

function Recuperar({ volver }: { volver: () => void }) {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await accesoService.pedirEnlace(email);
      setEnviado(true);
    } catch {
      setError('No se pudo enviar el enlace. Inténtalo en unos minutos.');
    } finally { setBusy(false); }
  }

  if (enviado) return (
    <div className="aparece">
      <Cabecera titulo="Revisa tu correo"
        texto="Si esa dirección tiene una cuenta en ANIMA, le enviamos un enlace para cambiar la contraseña. Mira también en spam." />
      <button onClick={volver} className={principal}>Volver a entrar</button>
    </div>
  );

  return (
    <form onSubmit={submit}>
      <Cabecera titulo="Recuperar contraseña"
        texto="Escribe tu correo y te enviamos un enlace para poner una nueva." />

      <label className={etiqueta}>Correo</label>
      <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
             autoComplete="email" className={campo + ' mb-5'} />

      {error && <Aviso tipo="mal">{error}</Aviso>}

      <button type="submit" disabled={busy} className={principal}>
        {busy ? 'Enviando…' : 'Enviar enlace'}
      </button>
      <button type="button" onClick={volver}
              className="w-full mt-3 text-[12.5px] text-muted hover:text-ink transition">
        Volver
      </button>
    </form>
  );
}

// ------------------------------------------------------------- solicitar

function Solicitar({ volver }: { volver: () => void }) {
  const [f, setF] = useState({ email: '', nombre: '', organizacion: '', mensaje: '' });
  const [linea, setLinea] = useState<'studio' | 'company'>('company');
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await accesoService.pedirAcceso({ ...f, linea });
      setListo(true);
    } catch {
      setError('No se pudo enviar la solicitud. Inténtalo en unos minutos.');
    } finally { setBusy(false); }
  }

  if (listo) return (
    <div className="aparece">
      <Cabecera titulo="Solicitud recibida"
        texto="Queda anotada. Te escribimos para conversar qué necesitas antes de abrir la cuenta: cada implementación se arma con quien la va a usar." />
      <button onClick={volver} className={principal}>Volver</button>
    </div>
  );

  return (
    <form onSubmit={submit}>
      <Cabecera titulo="Pedir acceso"
        texto="Cuéntanos quién eres y qué necesitas administrar. Esto no crea una cuenta: abre una conversación." />

      <label className={etiqueta}>Para qué plataforma</label>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {([['company', 'COMPANY', 'Una empresa'], ['studio', 'STUDIO', 'Mi obra']] as const).map(([v, n, d]) => (
          <button key={v} type="button" onClick={() => setLinea(v)}
            className={`text-left px-3.5 py-2.5 rounded-xl border toque ${
              linea === v ? 'border-accent bg-accent/8' : 'border-line bg-sunk hover:border-faint'}`}>
            <b className="block text-[12px] font-extrabold tracking-[.06em]">{n}</b>
            <span className="block text-[11px] text-muted mt-0.5">{d}</span>
          </button>
        ))}
      </div>

      <label className={etiqueta}>Correo</label>
      <input type="email" required value={f.email} onChange={e => set('email', e.target.value)}
             autoComplete="email" className={campo + ' mb-4'} />

      <label className={etiqueta}>Nombre</label>
      <input value={f.nombre} onChange={e => set('nombre', e.target.value)}
             autoComplete="name" className={campo + ' mb-4'} />

      <label className={etiqueta}>
        {linea === 'company' ? 'Empresa' : 'Taller o proyecto'}
        <span className="ml-1.5 normal-case tracking-normal text-faint">· opcional</span>
      </label>
      <input value={f.organizacion} onChange={e => set('organizacion', e.target.value)}
             className={campo + ' mb-4'} />

      <label className={etiqueta}>
        Qué necesitas <span className="ml-1.5 normal-case tracking-normal text-faint">· opcional</span>
      </label>
      <textarea rows={3} value={f.mensaje} onChange={e => set('mensaje', e.target.value)}
                className={campo + ' mb-5 resize-y'} />

      {error && <Aviso tipo="mal">{error}</Aviso>}

      <button type="submit" disabled={busy} className={principal}>
        {busy ? 'Enviando…' : 'Enviar solicitud'}
      </button>
      <button type="button" onClick={volver}
              className="w-full mt-3 text-[12.5px] text-muted hover:text-ink transition">
        Volver
      </button>

      <p className="text-[10.5px] text-faint mt-5 leading-relaxed">
        Al enviar aceptas los{' '}
        <a href={env.sitio + 'legal.html#terminos'} className="underline hover:text-muted">términos</a>{' '}
        y el{' '}
        <a href={env.sitio + 'legal.html#privacidad'} className="underline hover:text-muted">tratamiento de tus datos</a>.
        Usamos lo que escribas solo para responderte.
      </p>
    </form>
  );
}

// ----------------------------------------------------------------- pausa

/* Lo que ve un Alma de la Alpha. Se le dice lo único que de verdad le importa:
   que no se borró nada suyo, y cuándo vuelve. Sin pedir disculpas y sin
   prometer fechas que no existen. */
function EnPausa({ volver }: { volver: () => void }) {
  return (
    <div className="aparece">
      <Marca />
      <h1 className="text-[21px] font-extrabold tracking-tight leading-tight mt-7">
        Tu Alma está guardada.<br />El ingreso, en pausa.
      </h1>
      <p className="text-[13.5px] text-ink-2 mt-3 leading-relaxed">
        ANIMA está cambiando de piel: lo que empezó como la Alpha se está
        convirtiendo en la plataforma.
      </p>
      <p className="text-[13.5px] text-ink-2 mt-3 leading-relaxed">
        <b>No se borró nada tuyo.</b> Tu trayectoria, tus insignias, tu portafolio
        y tus huellas en el Árbol siguen exactamente donde las dejaste.
      </p>
      <p className="text-[13.5px] text-muted mt-3 leading-relaxed">
        El acceso se está reabriendo de a poco, por invitación.
      </p>
      <div className="flex items-center gap-3 mt-7">
        <button onClick={volver}
          className="text-[13px] font-bold px-4 py-2 rounded-full border border-line hover:border-faint transition">
          Volver
        </button>
        <a href={env.sitio} className="text-[13px] text-muted hover:text-ink transition inline-flex items-center gap-1.5">
          <Apex className="w-3 h-3" /> Ir a ANIMA
        </a>
      </div>
    </div>
  );
}
