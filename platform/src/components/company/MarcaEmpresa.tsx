import { useRef, useState } from 'react';
import { useTenant } from '@/core/tenant/TenantContext';
import { marcaService } from '@/services/marca.service';
import { MarcaCliente, PieAnima } from '@/components/Marca';

/* Donde el cliente pone su cara. Es a propósito lo más simple posible: un logo
   y nada más. Un panel de personalización con veinte controles termina en
   interfaces que no se parecen a nada; con un logo bien puesto, la plataforma
   ya es suya. */
export function MarcaDeLaEmpresa({ companyId, nombre }:
  { companyId: string; nombre: string }) {
  const { current, recargar } = useTenant();
  const marca = current?.company.branding ?? null;

  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function elegido(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';           // permite volver a elegir el mismo archivo
    if (!f) return;
    setSubiendo(true); setError(null); setListo(false);
    try {
      const url = await marcaService.subirLogo(companyId, f);
      await marcaService.guardar(companyId, { logo_url: url, color: marca?.color ?? null });
      recargar(); setListo(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo.');
    } finally { setSubiendo(false); }
  }

  async function quitar() {
    setSubiendo(true); setError(null); setListo(false);
    try {
      await marcaService.quitarLogo(companyId, marca?.logo_url);
      recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el logo.');
    } finally { setSubiendo(false); }
  }

  return (
    <section className="grid gap-3 aparece aparece-2">
      <div>
        <div className="rotulo">Tu marca</div>
        <p className="text-[13px] text-muted mt-1.5 max-w-[62ch]">
          Sube tu logo y la plataforma lo usa en tu espacio. ANIMA no desaparece:
          baja al pie, en pequeño.
        </p>
      </div>

      <div className="tarjeta p-5 grid gap-5">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="rounded-xl border border-line bg-sunk px-4 py-3">
            <MarcaCliente nombre={nombre} logo={marca?.logo_url} sub="Así se ve" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => archivo.current?.click()} disabled={subiendo}
              className="b b-pri">
              {subiendo ? 'Subiendo…' : marca?.logo_url ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {marca?.logo_url && (
              <button onClick={quitar} disabled={subiendo}
                className="b b-sec">Quitar</button>
            )}
          </div>
          <input ref={archivo} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml"
                 onChange={elegido} />
        </div>

        <p className="text-[12px] text-faint leading-relaxed">
          PNG, JPG, WEBP o SVG, hasta 2 MB. Se ve pequeño y sobre fondo claro: un
          símbolo o un logotipo horizontal funcionan mejor que una imagen con mucho detalle.
        </p>

        {error && (
          <p role="alert" className="entra text-[13px] text-danger bg-danger/10 border border-danger/20
                                     rounded-xl px-3.5 py-2.5">{error}</p>
        )}
        {listo && !error && (
          <p className="entra text-[13px] text-ok bg-ok/10 border border-ok/20 rounded-xl px-3.5 py-2.5">
            Listo. Tu logo ya está en el lateral.
          </p>
        )}

        <div className="border-t border-line pt-4">
          <PieAnima />
        </div>
      </div>
    </section>
  );
}
