import { useEffect, useState } from 'react';
import { cuotasService, type Cuota } from '@/services/cuotas.service';
import { cantidad } from '@/lib/formato';
import { env } from '@/config/env';

/* Las cuotas del plan, en el inicio.
   ---------------------------------------------------------------------------
   Un tope que se descubre al chocar es una trampa: la persona pierde el
   trabajo que estaba haciendo y no entiende por qué. Así que se enseña antes
   —cuánto va usado de cuánto—, se avisa al acercarse y recién al final se
   bloquea.

   Los planes sin topes no ven nada de esto: `cuotas()` les devuelve la lista
   vacía y la tarjeta no existe. No hay nada peor que enseñarle un límite a
   quien ya pagó por no tenerlo. */
export function Cuotas({ companyId }: { companyId: string }) {
  const [lista, setLista] = useState<Cuota[]>([]);

  useEffect(() => {
    let vivo = true;
    cuotasService.del(companyId)
      .then(d => { if (vivo) setLista(d); })
      .catch(() => { /* una cuota que no carga no puede tumbar el panel */ });
    return () => { vivo = false; };
  }, [companyId]);

  if (lista.length === 0) return null;

  const apretadas = lista.filter(c => c.pct >= 80).length;

  return (
    <section className="tarjeta p-5 aparece aparece-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="rotulo">Tu plan</h2>
        {apretadas > 0 && (
          <span className="marca marca-aviso">
            {apretadas === 1 ? '1 cuota casi llena' : `${apretadas} cuotas casi llenas`}
          </span>
        )}
      </div>

      <div className="grid gap-3 mt-4">
        {lista.map(c => <Barra key={c.clave} c={c} />)}
      </div>

      <p className="mt-4 leading-relaxed" style={{ fontSize: 11.5, color: 'var(--color-faint)' }}>
        Los topes son de volumen, no de funciones: ningún módulo está apagado y nada se borra al
        llegar al límite. Subir de plan los levanta sin migrar nada —{' '}
        <a href={env.sitio + 'planes.html'} target="_blank" rel="noreferrer"
           className="underline" style={{ color: 'var(--color-accent-deep)' }}>ver los planes</a>.
      </p>
    </section>
  );
}

function Barra({ c }: { c: Cuota }) {
  /* Tres estados y no un degradado: mientras hay aire no se dice nada, cerca
     del tope se avisa, y lleno se dice lleno. Un color que cambia de a poco no
     se nota; uno que salta, sí. */
  const lleno = c.uso >= c.tope;
  const cerca = !lleno && c.pct >= 80;
  const color = lleno ? 'var(--color-danger)' : cerca ? 'var(--color-aviso)' : 'var(--color-ink)';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span style={{ fontSize: 'var(--texto-md)' }}>{c.etiqueta}</span>
        <span className="cifra" style={{ fontSize: 'var(--texto-sm)', color }}>
          {cantidad(c.uso)} <span style={{ color: 'var(--color-faint)' }}>/ {cantidad(c.tope)}</span>
        </span>
      </div>
      <div className="mt-1.5 rounded-full overflow-hidden"
           style={{ height: 5, background: 'var(--color-sunk)' }}
           role="progressbar" aria-valuenow={c.pct} aria-valuemin={0} aria-valuemax={100}
           aria-label={`${c.etiqueta}: ${c.uso} de ${c.tope}`}>
        <div style={{ width: `${Math.max(c.pct, c.uso > 0 ? 3 : 0)}%`, height: '100%', background: color,
                      transition: 'width .3s ease' }} />
      </div>
      {lleno && (
        <p className="mt-1" style={{ fontSize: 11, color: 'var(--color-danger)' }}>
          Llegaste al tope. Lo que ya está guardado sigue ahí; para agregar más, sube de plan.
        </p>
      )}
    </div>
  );
}
