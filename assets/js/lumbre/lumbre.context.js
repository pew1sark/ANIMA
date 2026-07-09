/* ===========================================================
   LUMBRE — Contexto real de ANIMA
   Junta un resumen compacto (no el dump completo) del Alma
   activa a partir de las mismas fuentes que ya usa el resto de
   la app (Cloud.clients/quotes, me(), sum()). Nunca expone más
   de lo que el propio Creador ya puede ver en su sesión: mismo
   alcance que las políticas RLS existentes.
   =========================================================== */
const LumbreContext = {
  async buildForActiveAlma(){
    if(typeof me !== "function") return null;
    const a = me(); if(!a) return null;

    const proyectosActivos = (a.projects||[])
      .filter(p => p.st !== "Cerrado" && p.st !== "Entregado")
      .slice(0, 5)
      .map(p => ({ titulo: p.t, estado: p.st, avance: p.pct, cliente: p.client }));

    let vinculos = [], cotizaciones = [];
    try{ vinculos = (await Cloud.clients(a.almaId || a.id)).slice(0, 8).map(c => ({ nombre: c.name, tipo: c.kind })); }catch(e){}
    try{ cotizaciones = (await Cloud.quotes(a.almaId || a.id)).slice(0, 5).map(q => ({ titulo: q.title, total: q.total, moneda: q.currency, estado: q.status })); }catch(e){}

    const inc = (typeof sum === "function") ? sum(a.finance.income) : 0;
    const exp = (typeof sum === "function") ? sum(a.finance.expense) : 0;
    const ultimoHito = (a.trajectory||[]).length ? a.trajectory[a.trajectory.length - 1] : null;

    return {
      alma: { nombre: a.name, nivel: a.level, esencia: a.xp },
      raiz: { ingresos: inc, egresos: exp, ganancia: inc - exp },
      proyectosActivos,
      vinculos,
      cotizaciones,
      ultimoHito: ultimoHito ? { titulo: ultimoHito.t, anio: ultimoHito.y } : null
    };
  }
};
