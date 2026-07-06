/* ===========================================================
   LUMBRE — Permisos (Etapa 1)
   Único punto que decide si esta sesión puede usar LUMBRE
   conectada (Claude real) en vez del motor de reglas local.
   Reutiliza exactamente el mismo criterio que ya usa el resto
   de ANIMA para gatear funciones del Creador (isCreator/viewAs,
   definidos en anima.js). Si algún día LUMBRE se abre a otros
   planes, este es el único archivo que cambia.
   =========================================================== */
const LumbrePermissions = {
  canUseRealLumbre(){
    try{
      return !!(typeof isCreator !== "undefined" && isCreator &&
        !(typeof state !== "undefined" && state && state.viewAs));
    }catch(e){ return false; }
  }
};
