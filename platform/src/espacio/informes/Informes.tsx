import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dinero, cantidad } from '@/lib/formato';

/* Los informes. Todo lo calcula `informe_ventas()` en la base, por la misma
   razón que los totales de un pedido: para que no haya dos respuestas a la
   misma pregunta según por dónde se mire.

   Aquí no se suma nada; se dibuja. */

interface Informe {
  resumen: { ventas: number; costo: number; margen: number; pedidos: number;
             ticket: number; cobrado: number; por_cobrar: number };
  por_mes: { mes: string; ventas: number; margen: number; pedidos: number }[];
  top_clientes: { nombre: string; ventas: number; pedidos: number }[];
  top_productos: { nombre: string; cantidad: number; ventas: number }[];
  cobranza: { orden: number; tramo: string; monto: number; documentos: number }[];
  inventario: { lotes: number; valor: number; por_vencer: number };
}

/* En la moneda de la empresa, que la fija el espacio al abrirse. Antes esto
   escribía pesos chilenos siempre, aunque la empresa facturara en otra. */
const money = (n = 0) => dinero(n);
const num = (n = 0) => cantidad(n);

const PERIODOS = [
  { dias: 30,  nombre: '30 días' },
  { dias: 90,  nombre: '90 días' },
  { dias: 180, nombre: '6 meses' },
  { dias: 365, nombre: '1 año' }
] as const;

export function Informes({ companyId }: { companyId: string }) {
  const [dias, setDias] = useState<number>(180);
  const [datos, setDatos] = useState<Informe | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    const hasta = new Date();
    const desde = new Date(Date.now() - dias * 86400000);
    supabase.rpc('informe_ventas', {
      p_company: companyId,
      p_desde: desde.toISOString().slice(0, 10),
      p_hasta: hasta.toISOString().slice(0, 10)
    }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) setError(e.message); else setDatos(data as Informe);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [companyId, dias]);

  const margenPct = useMemo(() => {
    const v = datos?.resumen?.ventas ?? 0;
    return v > 0 ? Math.round(((datos?.resumen?.margen ?? 0) / v) * 100) : null;
  }, [datos]);

  const topMes = useMemo(() =>
    Math.max(1, ...(datos?.por_mes ?? []).map(m => Number(m.ventas) || 0)), [datos]);

  const vacio = !cargando && (datos?.resumen?.pedidos ?? 0) === 0;

  return (
    <div className="grid gap-5 aparece">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <div className="rotulo">Informes</div>
          <h1 className="titular mt-1.5">Cómo va el negocio</h1>
          <p className="text-[13px] text-muted mt-1.5">Lo que dicen tus datos, sin que nadie los interprete.</p>
        </div>
        <div className="grupo ml-auto">
          {PERIODOS.map(p => (
            <button key={p.dias} onClick={() => setDias(p.dias)} aria-pressed={dias === p.dias}>
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="entra text-[13px] text-danger bg-danger/10 border border-danger/20
                                   rounded-xl px-3.5 py-2.5">{error}</p>
      )}
      {cargando && <p className="text-[13px] text-muted">Calculando…</p>}

      {vacio && (
        <div className="tarjeta p-10 text-center">
          <p className="titular" style={{ fontSize: 22 }}>Todavía no hay ventas en este período</p>
          <p className="text-[13px] text-muted mt-1 max-w-[54ch] mx-auto">
            Los informes se llenan solos a medida que se registran pedidos. Nada que configurar.
          </p>
        </div>
      )}

      {!cargando && !vacio && datos && (
        <>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 aparece aparece-1">
            <Dato l="Ventas"    v={money(datos.resumen.ventas)} n={`${num(datos.resumen.pedidos)} pedidos`} />
            <Dato l="Margen"    v={money(datos.resumen.margen)}
                  n={margenPct != null ? `${margenPct}% sobre la venta` : undefined} />
            <Dato l="Ticket medio" v={money(datos.resumen.ticket)} />
            <Dato l="Por cobrar" v={money(datos.resumen.por_cobrar)}
                  alerta={datos.resumen.por_cobrar > 0} n={`${money(datos.resumen.cobrado)} cobrado`} />
          </div>

          {datos.por_mes.length > 0 && (
            <Bloque titulo="Mes a mes">
              {/* Barras en CSS: un gráfico de verdad pesaría más que toda la
                  pantalla y diría lo mismo. */}
              <div className="grid gap-2">
                {datos.por_mes.map(m => (
                  <div key={m.mes} className="flex items-center gap-3">
                    <span className="w-[62px] shrink-0 text-[12px] tabular-nums text-muted">{mesCorto(m.mes)}</span>
                    <span className="flex-1 h-6 rounded-md bg-sunk overflow-hidden">
                      <span className="block h-full bg-accent/40 rounded-md transition-[width] duration-500"
                            style={{ width: `${Math.max(2, (Number(m.ventas) / topMes) * 100)}%` }} />
                    </span>
                    <span className="w-[110px] shrink-0 text-right text-[12.5px] tabular-nums font-bold">
                      {money(m.ventas)}
                    </span>
                    <span className="w-[92px] shrink-0 text-right text-[11.5px] tabular-nums text-muted hidden sm:block">
                      {money(m.margen)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-faint mt-3">Barra: ventas · a la derecha, el margen.</p>
            </Bloque>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Bloque titulo="Quién compra más">
              <Lista filas={datos.top_clientes.map(c => ({
                nombre: c.nombre, valor: money(c.ventas), nota: `${num(c.pedidos)} pedidos` }))} />
            </Bloque>
            <Bloque titulo="Qué se vende más">
              <Lista filas={datos.top_productos.map(p => ({
                nombre: p.nombre, valor: money(p.ventas), nota: `${num(p.cantidad)} unid.` }))} />
            </Bloque>
          </div>

          <Bloque titulo="Antigüedad de lo que te deben"
                  nota="No es lo mismo deber hace tres días que hace tres meses.">
            <div className="grid gap-1.5">
              {datos.cobranza.map(t => (
                <div key={t.orden} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-sunk">
                  <span className="text-[12.5px] flex-1">{t.tramo}</span>
                  <span className="text-[11.5px] text-faint tabular-nums">{num(t.documentos)} doc.</span>
                  <span className={`text-[13px] font-bold tabular-nums w-[110px] text-right ${
                    t.orden >= 4 && Number(t.monto) > 0 ? 'text-danger' : ''}`}>
                    {money(t.monto)}
                  </span>
                </div>
              ))}
            </div>
          </Bloque>

          <Bloque titulo="Inventario">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <Suelto l="Lotes disponibles" v={num(datos.inventario.lotes)} />
              <Suelto l="Valor en bodega"   v={money(datos.inventario.valor)} />
              <Suelto l="Vencen en 7 días"  v={num(datos.inventario.por_vencer)}
                      alerta={datos.inventario.por_vencer > 0} />
            </div>
          </Bloque>
        </>
      )}
    </div>
  );
}

const Bloque = ({ titulo, nota, children }:
  { titulo: string; nota?: string; children: React.ReactNode }) => (
  <section className="tarjeta p-5 aparece aparece-2">
    <h2 className="rotulo">{titulo}</h2>
    {nota && <p className="text-[12px] text-faint mt-1 mb-3">{nota}</p>}
    <div className={nota ? '' : 'mt-3'}>{children}</div>
  </section>
);

const Lista = ({ filas }: { filas: { nombre: string; valor: string; nota: string }[] }) => (
  filas.length === 0
    ? <p className="text-[13px] text-muted">Sin datos en este período.</p>
    : <div className="grid gap-1.5">
        {filas.map((f, i) => (
          <div key={f.nombre + i} className="flex items-center gap-3">
            <span className="w-5 shrink-0 text-[11px] tabular-nums text-faint">{i + 1}</span>
            <span className="flex-1 min-w-0 text-[13px] truncate">{f.nombre}</span>
            <span className="text-[11.5px] text-faint tabular-nums shrink-0">{f.nota}</span>
            <span className="text-[13px] font-bold tabular-nums shrink-0 w-[100px] text-right">{f.valor}</span>
          </div>
        ))}
      </div>
);

const Dato = ({ l, v, n, alerta }: { l: string; v: string; n?: string; alerta?: boolean }) => (
  <div className="tarjeta p-4 toque">
    <div className="rotulo">{l}</div>
    <div className={`cifra-grande mt-2 ${alerta ? 'text-danger' : ''}`}>{v}</div>
    {n && <div className="text-[11.5px] text-faint mt-1.5">{n}</div>}
  </div>
);

const Suelto = ({ l, v, alerta }: { l: string; v: string; alerta?: boolean }) => (
  <span>
    <span className="rotulo block">{l}</span>
    <b className={`block text-[19px] cifra mt-1 ${alerta ? 'text-danger' : ''}`}>{v}</b>
  </span>
);

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function mesCorto(iso: string) {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1] ?? m} ${a?.slice(2)}`;
}
