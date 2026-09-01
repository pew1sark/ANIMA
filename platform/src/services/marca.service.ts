import { supabase } from '@/lib/supabase';

/* La marca de una organización: su logo y su color. Vive en
   `companies.branding`, y el archivo en el bucket público `marcas`.

   Público a propósito: un logo se muestra en la interfaz y no gana nada
   escondido tras una URL que caduca. Lo que se protege es quién puede subirlo
   —nivel 80— y eso lo hacen las políticas del bucket, no este archivo. */

export interface Marca {
  logo_url?: string | null;
  color?: string | null;
}

const MAX = 2 * 1024 * 1024;
const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export const marcaService = {
  async subirLogo(companyId: string, file: File): Promise<string> {
    if (!TIPOS.includes(file.type)) throw new Error('El logo debe ser PNG, JPG, WEBP o SVG.');
    if (file.size > MAX) throw new Error('El logo no puede pesar más de 2 MB.');

    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    /* Nombre nuevo en cada subida: si se reusara `logo.png`, el navegador y el
       CDN seguirían mostrando el anterior durante horas. */
    const ruta = `${companyId}/logo-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('marcas')
      .upload(ruta, file, { contentType: file.type, upsert: false });
    if (error) throw error;

    const { data } = supabase.storage.from('marcas').getPublicUrl(ruta);
    return data.publicUrl;
  },

  async guardar(companyId: string, marca: Marca): Promise<Marca> {
    const { data, error } = await supabase.rpc('guardar_marca', {
      p_company: companyId,
      p_logo_url: marca.logo_url ?? null,
      p_color: marca.color ?? null
    });
    if (error) throw error;
    return (data ?? {}) as Marca;
  },

  /* Quitar el logo deja la fila apuntando a nada; el archivo viejo se borra
     para no acumular basura en el bucket. */
  async quitarLogo(companyId: string, urlActual?: string | null): Promise<Marca> {
    if (urlActual) {
      const ruta = urlActual.split('/marcas/')[1];
      if (ruta) await supabase.storage.from('marcas').remove([ruta]);
    }
    return this.guardar(companyId, { logo_url: null, color: null });
  }
};
