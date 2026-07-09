/* ===========================================================
   ANIMA — Servicio de Obsidian
   Único punto que escribe en el Vault local del Creador. Usa la
   File System Access API del navegador: el Creador concede
   permiso a la carpeta del Vault una vez por sesión y desde aquí
   se escriben notas .md cuando ocurre un evento real (nuevo
   proyecto, nuevo vínculo, nueva cotización) — nunca por sync
   constante. Cada escritura queda trazada en obsidian_links.

   Limitación aceptada: el permiso de carpeta no persiste entre
   recargas de página (spec del navegador) — hay que reconectar
   al abrir el panel LUMBRE si no está activo.
   =========================================================== */
const ObsidianService = (function(){
  let dirHandle = null;

  function isConnected(){ return !!dirHandle; }

  async function connect(){
    if(!window.showDirectoryPicker){
      throw new Error("Este navegador no soporta conectar carpetas locales (usa Chrome o Edge).");
    }
    dirHandle = await window.showDirectoryPicker();
    return true;
  }

  function slugify(text){
    return String(text||"nota").toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g,"")
      .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") || "nota";
  }

  async function writeNote(folder, filename, content){
    if(!dirHandle) throw new Error("Conecta primero el Vault de Obsidian.");
    const sub = await dirHandle.getDirectoryHandle(folder, { create:true });
    const fileHandle = await sub.getFileHandle(filename, { create:true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return folder + "/" + filename;
  }

  async function saveProject(project, almaName){
    const id = project.id || project._id || null;
    const filename = slugify(project.t || project.title) + ".md";
    const content = `# ${project.t || project.title || "Proyecto"}\n\n`
      + `- Alma: ${almaName || ""}\n`
      + `- Estado: ${project.st || project.status || ""}\n`
      + `- Cliente: ${project.client || ""}\n`
      + `- Avance: ${project.pct != null ? project.pct : 0}%\n\n`
      + `${project.desc || project.description || ""}\n`;
    const path = await writeNote("Proyectos", filename, content);
    if(id){ try{ await Cloud.obsidianLink("projects", id, path); }catch(e){} }
    return path;
  }

  async function saveClient(client, almaName){
    const id = client.id || client._id || null;
    const filename = slugify(client.name) + ".md";
    const content = `# ${client.name || "Vínculo"}\n\n`
      + `- Alma: ${almaName || ""}\n`
      + `- Tipo: ${client.kind || "Cliente"}\n`
      + `- Correo: ${client.email || ""}\n`
      + `- Teléfono: ${client.phone || ""}\n\n`
      + `${client.notes || ""}\n`;
    const path = await writeNote("Clientes", filename, content);
    if(id){ try{ await Cloud.obsidianLink("clients", id, path); }catch(e){} }
    return path;
  }

  async function saveQuote(quote, almaName){
    const id = quote.id || quote._id || null;
    const filename = slugify(quote.title || ("cotizacion-" + Date.now())) + ".md";
    const content = `# ${quote.title || "Cotización"}\n\n`
      + `- Alma: ${almaName || ""}\n`
      + `- Cliente: ${quote.client_name || quote.client || ""}\n`
      + `- Total: ${quote.total || 0} ${quote.currency || ""}\n`
      + `- Estado: ${quote.status || ""}\n`;
    const path = await writeNote("Cotizaciones", filename, content);
    if(id){ try{ await Cloud.obsidianLink("quotes", id, path); }catch(e){} }
    return path;
  }

  async function appendDailyLog(entry){
    if(!dirHandle) throw new Error("Conecta primero el Vault de Obsidian.");
    const sub = await dirHandle.getDirectoryHandle("Diario", { create:true });
    const today = new Date().toISOString().slice(0,10);
    const fileHandle = await sub.getFileHandle(today + ".md", { create:true });
    const file = await fileHandle.getFile();
    const prev = await file.text();
    const writable = await fileHandle.createWritable();
    await writable.write(prev + `\n- ${new Date().toLocaleTimeString("es-CL")} — ${entry}\n`);
    await writable.close();
  }

  return { connect, isConnected, saveProject, saveClient, saveQuote, appendDailyLog };
})();
