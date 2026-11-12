// lib/consulta.js — consultas en lenguaje natural + pedido de DNI/CE
const { fichaPorDocumento, getSesion, setSesion, borrarSesion } = require('./db');

// Quita tildes y pasa a minúsculas
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ---- 1. Detectar la intención ----
const INTENCIONES = [
  { id: 'CODIGO', re: /(cual|mi|su|saber|conocer|dame|olvide).{0,25}codigo|codigo.{0,15}(tengo|es|mio)/ },
  { id: 'CURSO',  re: /(que|cual|en que|mi|su).{0,25}(curso|clase)|(estoy|esta|sigo).{0,15}(inscrit|matricul)|inscrit.{0,20}(escuela|edl|curso)|(escuela de lideres|edl).{0,20}(estoy|esta|tengo|curso)/ },
  { id: 'RESET',  re: /(tiene|tengo|tendra|hice|hizo|paso|fue|mi|su|ultimo|ultima).{0,25}(reset|recarga)|(reset|recarga).{0,20}(tiene|tengo|hice|hizo)/ },
];

function detectarIntencion(texto) {
  const t = norm(texto);
  const hit = INTENCIONES.find((i) => i.re.test(t));
  return hit ? hit.id : null;
}

// ---- 2. Validar DNI (8 dígitos) o CE (hasta 12 alfanuméricos) ----
function limpiarDocumento(texto) {
  const d = String(texto || '').replace(/[\s.\-]/g, '').toUpperCase();
  return /^\d{8}$/.test(d) || /^[A-Z0-9]{9,12}$/.test(d) ? d : null;
}

// ---- 3. Armar respuestas ----
const fmtFecha = (f) => new Date(f + 'T12:00:00')
  .toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });

function responder(intencion, f) {
  const nombre = `*${f.nombres}*`;

  if (intencion === 'CODIGO') {
    return `🔑 El código de ${nombre} es *${f.codigo}*.\n` +
      (f.lider_grupo
        ? `👥 Su líder es *${f.lider_grupo}* (Grupo ${f.codigo_grupo}).`
        : '👥 Aún no tiene un líder de Grupo de Conexión asignado.');
  }

  if (intencion === 'CURSO') {
    if (!f.curso_edl) return `🎓 ${nombre} no tiene inscripción registrada en Escuela de Líderes.`;
    return `🎓 ${nombre} está inscrito(a) en el curso *${f.curso_edl}*` +
      (f.horario_edl ? ` en el horario *${f.horario_edl}*` : '') +
      ` (ciclo ${f.ciclo_edl}).`;
  }

  if (intencion === 'RESET') {
    if (!f.ultima_fecha) return `🔥 ${nombre} no tiene Reset registrado.`;
    const tipo = f.ultimo_tipo === 'RECARGA' ? 'Recarga' : 'Reset';
    return `🔥 ${nombre} sí tiene Reset.\n` +
      `🔁 Su último fue *${tipo}* el *${fmtFecha(f.ultima_fecha)}*` +
      (f.ultima_edicion ? ` (${f.ultima_edicion}).` : '.');
  }
}

/**
 * Llamar con cada mensaje de texto entrante.
 * Devuelve el texto a enviar, o null si no le corresponde
 * (entonces sigue el flujo normal del bot: menú, IA, etc.)
 */
async function manejarConsulta(texto, telefono) {
  const intencionNueva = detectarIntencion(texto);

  // a) Pregunta nueva -> pedir documento
  if (intencionNueva) {
    await setSesion(telefono, intencionNueva);
    return 'Con gusto te ayudo 🙌\nPor favor ingresa tu *DNI* o *Carné de Extranjería (CE)*:';
  }

  // b) ¿Estamos esperando el documento?
  const sesion = await getSesion(telefono);
  if (!sesion) return null;

  if (/^\s*(cancelar|salir|menu)\s*$/i.test(norm(texto))) {
    await borrarSesion(telefono);
    return null;
  }

  const documento = limpiarDocumento(texto);
  if (!documento) {
    return 'El DNI tiene 8 dígitos y el CE hasta 12 caracteres. Inténtalo de nuevo o escribe *cancelar*.';
  }

  const ficha = await fichaPorDocumento(documento);
  await borrarSesion(telefono);

  if (!ficha) {
    return `No encontré el documento *${documento}* en nuestros registros 🙏\n` +
      'Verifica el número o escríbenos para ayudarte.';
  }
  return responder(sesion.intencion, ficha);
}

// Para botones del menú (id de la fila -> intención)
async function iniciarConsulta(intencion, telefono) {
  await setSesion(telefono, intencion);
  return 'Por favor ingresa tu *DNI* o *Carné de Extranjería (CE)*:';
}

module.exports = { manejarConsulta, iniciarConsulta, detectarIntencion };
