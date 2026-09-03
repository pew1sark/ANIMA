import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuth } from '@/core/auth/AuthContext';
import { Marca, Apex, ApexCompany } from '@/components/Marca';
import { accesoService } from '@/services/acceso.service';
import { env } from '@/config/env';

type Vista = 'entrar' | 'recuperar' | 'solicitar' | 'pausa';

/* La puerta de ANIMA TSC. Tres cosas se pueden hacer sin cuenta: entrar,
   recuperar la contraseña y pedir acceso. Registrarse solo NO es una de ellas:
   las cuentas se abren por invitación.

   La pantalla se parte en dos: a la izquierda ANIMA se presenta —fondo negro,
   el mismo del sitio, para que cruzar de animatsc.com a /app/ no se sienta
   como cambiar de empresa—, y a la derecha se trabaja. En un teléfono el lado
   oscuro desaparece: ahí lo único que importa es el formulario. */
export function Login() {
  const [vista, setVista] = useState<Vista>('entrar');

  return (
    <div className="min-h-full grid lg:grid-cols-[1.04fr_.96fr]">
      <Presentacion />

      <main className="grid place-items-center px-5 py-9">
        <div className="w-full max-w-[430px] aparece">
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
      </main>
    </div>
  );
}

/* El lado oscuro: qué es esto, antes de pedir un correo. Es lo mismo que dice
   la portada, en tres líneas — quien llega aquí desde un enlace directo no
   pasó por el sitio y no tiene por qué adivinarlo. */
function Presentacion() {
  return (
    <aside className="hidden lg:flex flex-col justify-between p-12 xl:p-16 text-white
                      bg-[#08080a] relative overflow-hidden">
      {/* El resplandor de la portada, muy tenue: da profundidad sin pedir turno. */}
      <div aria-hidden="true" className="absolute -top-1/3 left-1/2 -translate-x-1/2 w-[110%] aspect-square
                                         rounded-full blur-3xl opacity-[.13]
                                         bg-[radial-gradient(circle,#fff,transparent_62%)]" />
      <div className="relative flex items-center gap-3">
        <Apex className="w-[26px] h-[26px] text-white" />
        <span className="leading-none">
          <b className="block text-[15px] font-extrabold tracking-[.14em]">ANIMA</b>
          <span className="block mt-1 text-[9px] uppercase tracking-[.3em] font-bold text-white/45">TSC</span>
        </span>
      </div>

      <div className="relative max-w-[26rem]">
        <h2 className="text-[34px] xl:text-[40px] font-extrabold tracking-[-.03em] leading-[1.06]">
          Un sistema.<br />Dos plataformas.
        </h2>
        <p className="text-[13.5px] text-white/55 mt-4 leading-relaxed">
          La misma base, la misma cuenta, cada trabajo en su lugar. Lo que se te
          abre al entrar lo decide tu plan.
        </p>

        <div className="grid gap-3 mt-9">
          <Linea glifo={<Apex className="w-[18px] h-[18px]" />}
                 nombre="ANIMA STUDIO" texto="Para quien trabaja con su obra." />
          <Linea glifo={<ApexCompany className="w-[18px] h-[18px]" />}
                 nombre="ANIMA COMPANY" texto="Para empresas con operación." />
        </div>
      </div>

      <p className="relative text-[10.5px] uppercase tracking-[.28em] text-white/30">
        Technology System Connection
      </p>
    </aside>
  );
}

const Linea = ({ glifo, nombre, texto }: { glifo: ReactNode; nombre: string; texto: string }) => (
  <span className="flex items-center gap-3.5">
    <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0
                     border border-white/12 bg-white/[.04] text-white/85">{glifo}</span>
    <span className="leading-tight">
      <b className="block text-[13px] font-extrabold tracking-[.06em]">{nombre}</b>
      <span className="block text-[12px] text-white/45">{texto}</span>
    </span>
  </span>
);

const Tarjeta = ({ children }: { children: ReactNode }) => (
  <div className="bg-surface border border-line rounded-3xl p-7 sm:p-8 shadow-[0_18px_50px_rgba(0,0,0,.07)]">
    {children}
  </div>
);

const Cabecera = ({ titulo, texto }: { titulo: string; texto: string }) => (
  <>
    <span className="lg:hidden block"><Marca /></span>
    <h1 className="text-[22px] font-extrabold tracking-tight mt-7 lg:mt-0">{titulo}</h1>
    <p className="text-[13px] text-muted mt-1.5 mb-6 leading-relaxed">{texto}</p>
  </>
);

const Aviso = ({ tipo, children }: { tipo: 'mal' | 'bien'; children: ReactNode }) => (
  <p role="alert" className={`entra text-[13px] rounded-xl px-3.5 py-2.5 mb-4 border ${
    tipo === 'mal'
      ? 'text-danger bg-danger/10 border-danger/20'
      : 'text-ok bg-ok/10 border-ok/20'}`}>
    {children}
  </p>
);

/* El botón que espera. Mientras trabaja lo dice y gira: sin eso, en una red
   lenta se vuelve a pulsar tres veces y se mandan tres solicitudes. */
const Enviar = ({ busy, children, esperando }:
  { busy: boolean; children: ReactNode; esperando: string }) => (
  <button type="submit" disabled={busy} className="b b-pri b-lg b-blq">
    {busy ? <><span className="girito" />{esperando}</> : children}
  </button>
);

// ---------------------------------------------------------------- entrar

function Entrar({ irA }: { irA: (v: Vista) => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
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

      <label className="etiqueta" htmlFor="correo">Correo</label>
      <input id="correo" type="email" required value={email} onChange={e => setEmail(e.target.value)}
             autoComplete="email" autoFocus className="campo mb-4" />

      <div className="flex items-baseline justify-between">
        <label className="etiqueta" htmlFor="clave">Contraseña</label>
        <button type="button" onClick={() => irA('recuperar')}
                className="text-[11.5px] font-bold text-accent-deep hover:underline mb-1.5">
          ¿La olvidaste?
        </button>
      </div>
      {/* El ojo no es un adorno: escribir una contraseña larga a ciegas en un
          teléfono es la causa número uno de "no puedo entrar". */}
      <div className="relative mb-5">
        <input id="clave" type={verClave ? 'text' : 'password'} required value={password}
               onChange={e => setPassword(e.target.value)}
               autoComplete="current-password" className="campo pr-12" />
        <button type="button" onClick={() => setVerClave(v => !v)}
                aria-label={verClave ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg grid place-items-center
                           text-faint hover:text-ink hover:bg-sunk transition">
          {verClave ? <OjoCerrado /> : <Ojo />}
        </button>
      </div>

      {error && <Aviso tipo="mal">{error}</Aviso>}

      <Enviar busy={busy} esperando="Entrando…">Entrar</Enviar>

      <div className="h-px bg-line my-6" />

      <div className="rounded-2xl border border-accent/30 bg-accent/[.07] p-4">
        <span className="marca marca-acento">Un mes gratis</span>
        <p className="text-[12.5px] text-ink-2 leading-relaxed mt-2.5">
          Las cuentas se abren por invitación, con acompañamiento. Quien pide acceso
          ahora suma <b>un mes sin costo</b> al plan que contrate.
        </p>
        <button type="button" onClick={() => irA('solicitar')} className="b b-acento b-sm mt-3">
          Pedir acceso →
        </button>
      </div>
    </form>
  );
}

const Ojo = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const OjoCerrado = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3l18 18M10.6 10.7a3 3 0 0 0 4.2 4.2M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.7A17 17 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 3.4-.6" />
  </svg>
);

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
      <button onClick={volver} className="b b-pri b-lg b-blq">Volver a entrar</button>
    </div>
  );

  return (
    <form onSubmit={submit}>
      <Cabecera titulo="Recuperar contraseña"
        texto="Escribe tu correo y te enviamos un enlace para poner una nueva." />

      <label className="etiqueta" htmlFor="correo-rec">Correo</label>
      <input id="correo-rec" type="email" required autoFocus value={email}
             onChange={e => setEmail(e.target.value)}
             autoComplete="email" className="campo mb-5" />

      {error && <Aviso tipo="mal">{error}</Aviso>}

      <Enviar busy={busy} esperando="Enviando…">Enviar enlace</Enviar>
      <button type="button" onClick={volver} className="b b-fan b-blq mt-2">Volver</button>
    </form>
  );
}

// ------------------------------------------------------------- solicitar

function Solicitar({ volver }: { volver: () => void }) {
  const [f, setF] = useState({ email: '', nombre: '', organizacion: '', telefono: '', mensaje: '' });
  const [linea, setLinea] = useState<'studio' | 'company'>('company');
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await accesoService.pedirAcceso({ ...f, linea, fuente: 'login', promo: 'mes-extra' });
      setListo(true);
    } catch {
      setError('No se pudo enviar la solicitud. Inténtalo en unos minutos.');
    } finally { setBusy(false); }
  }

  if (listo) return (
    <div className="aparece">
      <Cabecera titulo="Solicitud recibida"
        texto="Queda anotada, con tu mes gratis reservado. Te escribimos para conversar qué necesitas antes de abrir la cuenta: cada implementación se arma con quien la va a usar." />
      <button onClick={volver} className="b b-pri b-lg b-blq">Volver</button>
    </div>
  );

  return (
    <form onSubmit={submit}>
      <Cabecera titulo="Pedir acceso"
        texto="Cuéntanos quién eres y qué necesitas administrar. Esto no crea una cuenta: abre una conversación, y te reserva un mes gratis." />

      <span className="etiqueta">Para qué plataforma</span>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {([
          ['company', 'COMPANY', 'Una empresa'],
          ['studio',  'STUDIO',  'Mi obra'],
        ] as const).map(([v, n, d]) => (
          <button key={v} type="button" onClick={() => setLinea(v)}
                  aria-pressed={linea === v} className="opcion">
            <span className="flex items-center gap-2">
              {v === 'company' ? <ApexCompany className="w-4 h-4" /> : <Apex className="w-4 h-4" />}
              <b className="text-[12px] font-extrabold tracking-[.06em]">{n}</b>
            </span>
            <span className="block text-[11px] text-muted mt-0.5">{d}</span>
          </button>
        ))}
      </div>

      <label className="etiqueta" htmlFor="s-correo">Correo</label>
      <input id="s-correo" type="email" required value={f.email} onChange={e => set('email', e.target.value)}
             autoComplete="email" className="campo mb-4" />

      <label className="etiqueta" htmlFor="s-nombre">Nombre</label>
      <input id="s-nombre" value={f.nombre} onChange={e => set('nombre', e.target.value)}
             autoComplete="name" className="campo mb-4" />

      <label className="etiqueta" htmlFor="s-org">
        {linea === 'company' ? 'Empresa' : 'Taller o proyecto'}
        <span className="opcional"> · opcional</span>
      </label>
      <input id="s-org" value={f.organizacion} onChange={e => set('organizacion', e.target.value)}
             className="campo mb-4" />

      <label className="etiqueta" htmlFor="s-tel">
        Teléfono <span className="opcional">· opcional</span>
      </label>
      <input id="s-tel" type="tel" value={f.telefono} onChange={e => set('telefono', e.target.value)}
             autoComplete="tel" inputMode="tel" placeholder="+56 9 …" className="campo mb-4" />

      <label className="etiqueta" htmlFor="s-msg">
        Qué necesitas <span className="opcional">· opcional</span>
      </label>
      <textarea id="s-msg" rows={3} value={f.mensaje} onChange={e => set('mensaje', e.target.value)}
                className="campo mb-5 resize-y" />

      {error && <Aviso tipo="mal">{error}</Aviso>}

      <Enviar busy={busy} esperando="Enviando…">Enviar solicitud</Enviar>
      <button type="button" onClick={volver} className="b b-fan b-blq mt-2">Volver</button>

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
      <span className="lg:hidden block"><Marca /></span>
      <h1 className="text-[21px] font-extrabold tracking-tight leading-tight mt-7 lg:mt-0">
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
      <div className="flex items-center gap-2 mt-7">
        <button onClick={volver} className="b b-sec">Volver</button>
        <a href={env.sitio} className="b b-fan">
          <Apex className="w-3.5 h-3.5" /> Ir a ANIMA
        </a>
      </div>
    </div>
  );
}
