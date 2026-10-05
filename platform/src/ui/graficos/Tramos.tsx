/* Una barra apilada horizontal para categorías que SÍ tienen orden propio: la
   antigüedad de la deuda. Por eso lleva rampa de un solo tono en vez de colores
   distintos — el tono más oscuro es el tramo más viejo, y eso se entiende sin
   leer la leyenda.

   Una rampa sobre categorías sin orden (productos, clientes) sería un error:
   pintaría de oscuro al más grande y gastaría el color en repetir lo que el
   largo de la barra ya dice. Aquí el orden existe y es el dato. */

export interface Tramo { clave: string; nombre: string; monto: number; documentos?: number }

const RAMPA = ['var(--rampa-2)', 'var(--rampa-3)', 'var(--rampa-4)', 'var(--rampa-5)', 'var(--rampa-6)'];

export function Tramos({ tramos, formato }: { tramos: Tramo[]; formato: (v: number) => string }) {
  const total = tramos.reduce((s, t) => s + (Number(t.monto) || 0), 0);
  const conMonto = tramos.filter(t => (Number(t.monto) || 0) > 0);

  if (total <= 0) {
    return (
      <p style={{ fontSize: 'var(--texto-md)', color: 'var(--color-muted)' }}>
        No te deben nada. Todo lo facturado está pagado.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex w-full rounded-lg overflow-hidden" style={{ height: 14 }}>
        {conMonto.map((t, i, arr) => (
          <span key={t.clave}
                title={`${t.nombre}: ${formato(t.monto)}`}
                style={{
                  width: `${(Number(t.monto) / total) * 100}%`,
                  background: RAMPA[tramos.indexOf(t)] ?? RAMPA[RAMPA.length - 1],
                  marginRight: i === arr.length - 1 ? 0 : 2
                }} />
        ))}
      </div>

      {/* La leyenda lleva el valor al lado: es lo que la vuelve legible sin
          tener que comparar anchos a ojo. */}
      <div className="grid gap-1">
        {tramos.map((t, i) => {
          const monto = Number(t.monto) || 0;
          const viejo = i >= 3 && monto > 0;
          return (
            <div key={t.clave} className="flex items-center gap-2.5"
                 style={{ fontSize: 'var(--texto-sm)', opacity: monto > 0 ? 1 : .45 }}>
              <span className="llave" style={{ background: RAMPA[i] ?? RAMPA[RAMPA.length - 1] }} />
              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--color-ink-2)' }}>{t.nombre}</span>
              {t.documentos != null && (
                <span className="tabular-nums shrink-0" style={{ color: 'var(--color-faint)', fontSize: 11 }}>
                  {t.documentos} doc.
                </span>
              )}
              <span className={`cifra shrink-0 text-right ${viejo ? 'text-danger' : ''}`} style={{ width: 104 }}>
                {formato(monto)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
