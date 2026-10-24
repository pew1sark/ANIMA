// Prueba del armado y la firma de los DTE, sin red ni Supabase.
//   node --experimental-strip-types supabase/tests/sii_dte.test.mjs
// Necesita openssl, python3 y lxml: lxml canonicaliza el XML por su cuenta, así
// que la firma se comprueba contra una implementación distinta de c14n().
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { armarDte, armarSobre, calcular, dvRut, firmarSemilla, leerCaf, rutLimpio } from "../functions/sii-dte/dte.ts";

const dir = mkdtempSync(join(tmpdir(), "sii-"));
const sh = (...a) => execFileSync(a[0], a.slice(1), { cwd: dir, encoding: "utf8" });
sh("openssl", "genrsa", "-traditional", "-out", "k.pem", "2048");
sh("openssl", "req", "-x509", "-new", "-key", "k.pem", "-subj", "/CN=Prueba", "-days", "30", "-out", "c.pem");
sh("openssl", "genrsa", "-traditional", "-out", "caf.pem", "2048");
const f = { llavePem: readFileSync(join(dir, "k.pem"), "utf8"), certPem: readFileSync(join(dir, "c.pem"), "utf8") };
const cafKey = readFileSync(join(dir, "caf.pem"), "utf8");
const cafXml = (td) => `<?xml version="1.0"?>\n<AUTORIZACION>\n <CAF version="1.0">\n  <DA><RE>76123456-0</RE><RS>EMPRESA &amp; CIA</RS><TD>${td}</TD>\n   <RNG><D>1</D><H>50</H></RNG><FA>2026-10-01</FA><RSAPK><M>AA==</M><E>Aw==</E></RSAPK><IDK>100</IDK></DA>\n  <FRMA algoritmo="SHA1withRSA">AAAA</FRMA>\n </CAF>\n <RSASK>${cafKey}</RSASK>\n</AUTORIZACION>`;

// --- RUT y totales
assert.equal(dvRut("76123456"), "0"); assert.equal(dvRut("12345678"), "5");
assert.equal(rutLimpio("12.345.678-5"), "12345678-5"); assert.equal(rutLimpio("12345678-4"), null);
let r = calcular(33, [{ nombre: "a", cantidad: 2, precio: 10000 }, { nombre: "b", cantidad: 1, precio: 5000, exento: true }]);
assert.deepEqual(r.t, { neto: 20000, exento: 5000, iva: 3800, total: 28800 });
r = calcular(39, [{ nombre: "a", cantidad: 1, precio: 11900 }]);
assert.deepEqual(r.t, { neto: 10000, exento: 0, iva: 1900, total: 11900 });
assert.equal(calcular(34, [{ nombre: "a", cantidad: 1, precio: 500 }]).t.iva, 0);

// --- documentos
const emisor = { rut: "76123456-0", razon_social: "Empresa & Cía", giro: "Servicios", acteco: 620200, direccion: "Calle 1", comuna: "Santiago", rut_envia: "12345678-5", resol_fecha: "2026-01-01", resol_numero: 0 };
const rec = { rut: "12345678-5", razon_social: "Cliente Ñandú <SpA>", giro: "Comercio", direccion: "Av. 2", comuna: "Providencia" };
const casos = [
  { tipo: 33, items: [{ nombre: "Mural \"grande\"", cantidad: 1, precio: 100000 }] },
  { tipo: 34, items: [{ nombre: "Clase", cantidad: 3, precio: 5000 }] },
  { tipo: 39, items: [{ nombre: "Taller", cantidad: 1, precio: 11900 }], receptor: { rut: "66666666-6" } },
  { tipo: 61, items: [{ nombre: "Anula", cantidad: 1, precio: 100000 }], referencia: { tipo_doc: 33, folio: 1, fecha: "2026-10-20", codigo: 1, razon: "Anula" } },
];
for (const c of casos) {
  const caf = leerCaf(cafXml(c.tipo));
  assert.equal(caf.rut, "76123456-0"); assert.equal(caf.hasta, 50);
  const { dte } = armarDte({ ...c, folio: 7, fecha: "2026-10-20", receptor: c.receptor || rec }, emisor, caf, f);
  const xml = armarSobre([{ dte, tipo: c.tipo }], emisor, f);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="ISO-8859-1"?>'));
  assert.ok(xml.includes(c.tipo === 39 ? "<EnvioBOLETA" : "<EnvioDTE"));
  writeFileSync(join(dir, `t${c.tipo}.xml`), Buffer.from(xml, "latin1"));   // como viaja al SII
}
writeFileSync(join(dir, "semilla.xml"), firmarSemilla("012345678901", f));

// --- verificación independiente (lxml + openssl)
writeFileSync(join(dir, "verif.py"), `
import sys, re, base64, hashlib, subprocess
from lxml import etree
D="http://www.w3.org/2000/09/xmldsig#"
SII="http://www.sii.cl/SiiDte"; XSI="http://www.w3.org/2001/XMLSchema-instance"
def canon(datos):
    return subprocess.run(["xmllint","--c14n","-"],input=datos,check=True,capture_output=True).stdout.decode()
def subarbol(texto, apertura, cierre, ns):
    # xmllint canonicaliza documentos enteros: el subárbol es ese mismo texto con
    # los espacios de nombres vigentes declarados en el elemento de arriba.
    i = texto.index(apertura); j = texto.index(cierre, i) + len(cierre)
    tag, resto = apertura[1:].split(" ", 1) if " " in apertura else (apertura[1:-1], ">")
    return "<" + tag + ns + (" " + resto if " " in apertura else ">") + texto[i+len(apertura):j]
def sha1(t): return base64.b64encode(hashlib.sha1(t.encode()).digest()).decode()
def revisar(ruta):
    datos = open(ruta,"rb").read()
    raiz = etree.fromstring(datos)
    firmas = raiz.findall(".//{%s}Signature" % D)
    assert firmas, "sin firmas"
    todo = canon(datos)
    infos = re.findall(r"<SignedInfo>.*?</SignedInfo>", todo, re.S)
    assert len(infos) == len(firmas)
    for s, info_c in zip(firmas, infos):
        ref = s.find("{%s}SignedInfo/{%s}Reference" % (D,D))
        uri = ref.get("URI")
        sii = "" if ruta.startswith("semilla") else ' xmlns="%s" xmlns:xsi="%s"' % (SII, XSI)
        if uri:
            ident = uri[1:]
            etiqueta = raiz.xpath("//*[@ID=$i]", i=ident)[0].tag.split("}")[-1]
            cuerpo = subarbol(todo, '<%s ID="%s">' % (etiqueta, ident), "</%s>" % etiqueta, sii)
        else:
            raiz.remove(raiz.find("{%s}Signature" % D))
            cuerpo = canon(etree.tostring(raiz))
        assert sha1(cuerpo) == ref.find("{%s}DigestValue" % D).text, "digest distinto en %s" % uri
        info = "<SignedInfo" + ' xmlns="%s"' % D + (' xmlns:xsi="%s"' % XSI if sii else "") + info_c[len("<SignedInfo"):]
        open("si.bin","wb").write(info.encode())
        open("sig.bin","wb").write(base64.b64decode(s.find("{%s}SignatureValue" % D).text))
        subprocess.run(["openssl","x509","-in","c.pem","-pubkey","-noout","-out","pub.pem"],check=True)
        subprocess.run(["openssl","dgst","-sha1","-verify","pub.pem","-signature","sig.bin","si.bin"],check=True,stdout=subprocess.DEVNULL)
    return len(firmas)
for ruta in sys.argv[1:]:
    print(ruta, revisar(ruta), "firmas ok")
`);
const salida = sh("python3", "verif.py", "t33.xml", "t34.xml", "t39.xml", "t61.xml", "semilla.xml");
console.log(salida.trim());
assert.equal((salida.match(/firmas ok/g) || []).length, 5);

// --- el TED se verifica con la llave del CAF (SHA1withRSA sobre el DD en latin1)
const x33 = readFileSync(join(dir, "t33.xml"), "latin1");
const dd = /<DD>[\s\S]*?<\/DD>/.exec(x33)[0];
const frmt = /<FRMT algoritmo="SHA1withRSA">([^<]+)<\/FRMT>/.exec(x33)[1];
sh("openssl", "rsa", "-in", "caf.pem", "-pubout", "-out", "cafpub.pem");
writeFileSync(join(dir, "dd.bin"), Buffer.from(dd, "latin1")); writeFileSync(join(dir, "frmt.bin"), Buffer.from(frmt, "base64"));
sh("openssl", "dgst", "-sha1", "-verify", "cafpub.pem", "-signature", "frmt.bin", "dd.bin");
assert.ok(dd.includes("<RSR>Cliente Ñandú &lt;SpA&gt;</RSR>"), "latin1 + escapes");
assert.ok(dd.includes("<CAF version=\"1.0\"><DA>"), "CAF compacto");
console.log("sii_dte: todo correcto");
