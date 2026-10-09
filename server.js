const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ==== Variables de entorno ====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ADMIN_PHONE = process.env.ADMIN_PHONE; // tu número (o el del encargado). Ej: 51961871143
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // contraseña de la página /admin (usa 16+ caracteres)
const MAX_BROADCAST = 250; // máximo de contactos por envío (límite de Meta hasta verificar el negocio)

const GRAPH_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

// ==== Respuestas del bot ====
const answers = {
  familiar:
    '🕘 *Servicio Familiar* 🧑\u200d🧑\u200d🧒\u200d🧒\nDomingos:\n08:00 a.m.\n10:00 a.m.\n12:00 p.m.\n06:00 p.m.',
  next: '🕕 *NEXT (jóvenes):*\nSábados, 6:00 p.m.',
  intercesion: '🙏 *Intercesión:*\nSábado, 6:30 a.m.',
  lideres:
    '📚 *Escuela de líderes:*\n\nLunes:\nDiscipulados 1, 2 y 3 — 8:00 p.m.\n\nMartes:\nLíderes 1, 2 y 3 — 8:00 p.m.\n\nMiércoles:\nSeminario Consejería — 8:00 p.m.\n\nSábados:\nDiscipulados NEXT 1, 2 y 3 — 4:00 p.m.',
  direccion:
    '📍 *Sede Surco:* Víctor Plascencia 181 (Ref. Estación Jorge Chávez). Pastores: Diego y Brigitte García.',
  reset:
    '🔥 *Próximo Reset publicado:*\n\n👩🏻 Reset Mujeres (26 a 65 años)\nDel 09 al 11 de octubre.\n\nCamp Next (12 a 17 años):\nDel 16 al 18 de octubre.\n\nReset Recarga Hombres y Mujeres (26 a 65 años)\nDel 23 al 25 de octubre.\n\n(Cronograma sujeto a confirmación, ver https://www.ccaguaviva.org/reset/)',
  saludo: '🙌 ¡Bienvenido(a) a Agua Viva Surco! Que la paz y las bendiciones de Dios estén contigo hoy.',
  despedida:
    '🙏 Gracias a ti. Que el Señor te acompañe y te bendiga en todo lo que emprendas hoy. ¡Esperamos verte pronto en Agua Viva Surco!',
  finalizar:
    '🙏 Gracias por escribirnos. Que Dios te bendiga y nos vemos pronto en Agua Viva Surco. Cuando quieras volver, escribe *Hola*.',
  ayuda: 'Toca el botón de abajo para ver las opciones disponibles 👇',
};

// A qué menú regresa el botón "Menú anterior" según la opción consultada
const backTarget = {
  familiar: 'volver_reuniones',
  next: 'volver_reuniones',
  intercesion: 'volver_reuniones',
  lideres: 'volver_main',
  direccion: 'volver_main',
  reset: 'volver_main',
};

// Menú principal (lista)
const menuRows = [
  { id: 'integrante', title: 'NUEVO INTEGRANTE', description: 'Vienes por primera vez' },
  { id: 'reuniones', title: 'REUNIONES', description: 'Horario de servicio' },
  { id: 'reset', title: 'RESET', description: 'Próximo encuentro' },
  { id: 'conexion', title: 'GRUPO DE CONEXIÓN', description: '¿Ya tienes uno?' },
  { id: 'lideres', title: 'ESCUELA DE LIDERES', description: 'Horario de clases' },
  { id: 'direccion', title: 'DIRECCION', description: 'Ubicación de la sede' },
];

const keywords = [
  [/^(hola|buen[oa]s?\s?(d[ií]as|tardes|noches)|saludos|hey|qu[eé]\s?tal|dios te bendiga|paz de dios|bendiciones)/i, 'saludo'],
  [/gracias|chau|chao|bye|adi[oó]s|hasta luego|nos vemos/i, 'despedida'],
  [/^baja\b|darme de baja|no quiero recibir|dejar de recibir/i, 'baja'],
  [/menu|opciones|ayuda/i, 'menu'],
  [/nuevo integrante|primera vez|soy nuevo/i, 'integrante'],
  [/reunion/i, 'reuniones'],
  [/famil/i, 'familiar'],
  [/domin/i, 'familiar'],
  [/next/i, 'next'],
  [/interces/i, 'intercesion'],
  [/l[ií]der/i, 'lideres'],
  [/direcc|ubicaci|donde/i, 'direccion'],
  [/reset/i, 'reset'],
  [/conexi[oó]n|grupo/i, 'conexion'],
];

// ==== Estado de conversación por usuario (en memoria) ====
const sessions = new Map(); // wa_id -> { flow, tempName, tempPhone }

function getSession(waId) {
  if (!sessions.has(waId)) sessions.set(waId, { flow: null, tempName: '', tempPhone: '' });
  return sessions.get(waId);
}

// ==== Envío de mensajes de texto simple ====
async function sendText(to, body) {
  await axios.post(
    GRAPH_URL,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// ==== Menú principal (lista) ====
async function sendMainMenu(to, bodyText) {
  await axios.post(
    GRAPH_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: 'Ver opciones',
          sections: [{ title: 'Agua Viva Surco', rows: menuRows }],
        },
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// ==== Submenú de Reuniones (botones) ====
async function sendReunionesMenu(to) {
  await axios.post(
    GRAPH_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Elige el servicio que quieres consultar:' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'familiar', title: 'FAMILIAR' } },
            { type: 'reply', reply: { id: 'next', title: 'NEXT' } },
            { type: 'reply', reply: { id: 'intercesion', title: 'INTERCESION' } },
          ],
        },
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// ==== Botones Sí / No (Grupo de conexión) ====
async function sendYesNo(to, bodyText) {
  await axios.post(
    GRAPH_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'si', title: 'Sí' } },
            { type: 'reply', reply: { id: 'no', title: 'No' } },
          ],
        },
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// ==== Botones de navegación: Menú anterior / Finalizar ====
async function sendNav(to, backId) {
  await axios.post(
    GRAPH_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: '¿Qué deseas hacer ahora?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: backId, title: 'Menú anterior' } },
            { type: 'reply', reply: { id: 'finalizar', title: 'Finalizar' } },
          ],
        },
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

// Envía la respuesta de una opción y, si corresponde, los botones de navegación
async function sendAnswer(to, key) {
  await sendText(to, answers[key]);
  if (backTarget[key]) await sendNav(to, backTarget[key]);
}

// ==== Notificación al equipo cuando alguien deja sus datos ====
async function notifyAdmin(titulo, nombre, celular, distrito, waId) {
  if (!ADMIN_PHONE) return;
  await sendText(
    ADMIN_PHONE,
    `📋 *${titulo}*\nNombre: ${nombre}\nCelular: ${celular}\nDistrito: ${distrito}\nWhatsApp: ${waId}`
  ).catch((e) => console.error('No se pudo notificar al admin:', e.response?.data || e.message));
}

// ==== Lógica principal ====
async function handleMessage(waId, text, interactiveId) {
  const session = getSession(waId);
  const val = (text || '').trim();

  // --- Navegación: Menú anterior / Finalizar ---
  if (interactiveId === 'volver_main') {
    session.flow = null;
    await sendMainMenu(waId, 'Elige una opción:');
    return;
  }
  if (interactiveId === 'volver_reuniones') {
    session.flow = null;
    await sendReunionesMenu(waId);
    return;
  }
  if (interactiveId === 'finalizar') {
    session.flow = null;
    await sendText(waId, answers.finalizar);
    return;
  }

  // --- Botones Sí/No de Grupo de Conexión ---
  if (interactiveId === 'si') {
    session.flow = null;
    await sendText(
      waId,
      '🙏 ¡Qué alegría saber que ya formas parte de un Grupo de Conexión! Que sigas creciendo junto a tu grupo y experimentando el amor de Dios cada día. Dios te bendiga.'
    );
    await sendNav(waId, 'volver_main');
    return;
  }
  if (interactiveId === 'no') {
    session.flow = 'conexion_nombre';
    await sendText(waId, 'Con gusto te contactamos. Por favor escribe tus *nombres completos*:');
    return;
  }

  // --- Selección del menú principal / submenú ---
  if (interactiveId === 'integrante') {
    session.flow = 'integrante_nombre';
    await sendText(waId, 'Con gusto te contactamos. Por favor escribe tus *nombres completos*:');
    return;
  }
  if (interactiveId === 'reuniones') {
    await sendReunionesMenu(waId);
    return;
  }
  if (interactiveId === 'conexion') {
    await sendYesNo(waId, '¿Tienes Grupo de Conexión?');
    return;
  }
  if (interactiveId && answers[interactiveId]) {
    await sendAnswer(waId, interactiveId);
    return;
  }

  // --- Flujo: Nuevo integrante ---
  if (session.flow === 'integrante_nombre') {
    session.tempName = val;
    session.flow = 'integrante_celular';
    await sendText(waId, 'Gracias. Ahora escribe tu *número de celular*:');
    return;
  }
  if (session.flow === 'integrante_celular') {
    session.tempPhone = val;
    session.flow = 'integrante_distrito';
    await sendText(waId, 'Gracias. Ahora escribe de *qué distrito* nos visitas:');
    return;
  }
  if (session.flow === 'integrante_distrito') {
    const { tempName, tempPhone } = session;
    session.flow = null;
    session.tempName = '';
    session.tempPhone = '';
    await sendText(
      waId,
      `¡Gracias, ${tempName}! 🙌 Ya registramos tus datos (${tempName} — ${tempPhone} — ${val}) y muy pronto alguien de nuestro equipo te contactará para poder guiarte en la iglesia. Dios te bendiga.`
    );
    await notifyAdmin('Nuevo integrante', tempName, tempPhone, val, waId);
    await sendNav(waId, 'volver_main');
    return;
  }

  // --- Flujo: Grupo de conexión (No tiene grupo) ---
  if (session.flow === 'conexion_nombre') {
    session.tempName = val;
    session.flow = 'conexion_celular';
    await sendText(waId, 'Gracias. Ahora escribe tu *número de celular*:');
    return;
  }
  if (session.flow === 'conexion_celular') {
    session.tempPhone = val;
    session.flow = 'conexion_distrito';
    await sendText(waId, 'Gracias. Ahora escribe de *qué distrito* nos visitas:');
    return;
  }
  if (session.flow === 'conexion_distrito') {
    const { tempName, tempPhone } = session;
    session.flow = null;
    session.tempName = '';
    session.tempPhone = '';
    await sendText(
      waId,
      `¡Gracias, ${tempName}! 🙌 Ya registramos tus datos (${tempName} — ${tempPhone} — ${val}) y muy pronto alguien de nuestro equipo te contactará para conectarte con un Grupo de Conexión. Dios te bendiga.`
    );
    await notifyAdmin('Interesado en Grupo de Conexión', tempName, tempPhone, val, waId);
    await sendNav(waId, 'volver_main');
    return;
  }

  // --- Texto libre: buscar palabra clave ---
  const match = keywords.find(([re]) => re.test(val));
  const key = match ? match[1] : null;

  if (key === 'baja') {
    await sendText(waId, '✅ Listo. No volverás a recibir anuncios nuestros. Si cambias de opinión, escribe *Hola*.');
    if (ADMIN_PHONE) {
      await sendText(ADMIN_PHONE, `🚫 *Solicitud de baja de anuncios*\nWhatsApp: ${waId}\nQuítalo de tu lista de envío.`).catch((e) =>
        console.error('No se pudo notificar la baja:', e.response?.data || e.message)
      );
    }
    return;
  }
  if (key === 'saludo') {
    await sendText(waId, answers.saludo);
    await sendMainMenu(waId, '¿En qué puedo ayudarte hoy?');
    return;
  }
  if (key === 'menu') {
    await sendMainMenu(waId, 'Elige una opción:');
    return;
  }
  if (key === 'integrante') {
    session.flow = 'integrante_nombre';
    await sendText(waId, 'Con gusto te contactamos. Por favor escribe tus *nombres completos*:');
    return;
  }
  if (key === 'reuniones') {
    await sendReunionesMenu(waId);
    return;
  }
  if (key === 'conexion') {
    await sendYesNo(waId, '¿Tienes Grupo de Conexión?');
    return;
  }
  if (key && answers[key]) {
    await sendAnswer(waId, key); // despedida no tiene botones de navegación
    return;
  }

  // No se reconoció nada: mostrar el menú
  await sendText(waId, answers.ayuda);
  await sendMainMenu(waId, 'Elige una opción:');
}


// ==== Envío de plantillas (anuncios masivos) ====
async function sendTemplate(to, name, lang, param) {
  const template = { name, language: { code: lang } };
  if (param) template.components = [{ type: 'body', parameters: [{ type: 'text', text: param }] }];
  await axios.post(
    GRAPH_URL,
    { messaging_product: 'whatsapp', to, type: 'template', template },
    { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
  );
}

function normalizePhone(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 9 && d.startsWith('9')) d = '51' + d; // celular peruano sin código de país
  return d.length >= 11 && d.length <= 15 ? d : null;
}

// Cada línea: número, nombre (el nombre es opcional)
function parseContacts(text) {
  const seen = new Set();
  const contacts = [];
  let lines = 0;
  String(text || '').split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    lines++;
    const [num, ...rest] = line.split(/[,;\t]/);
    const to = normalizePhone(num || '');
    if (!to || seen.has(to)) return;
    seen.add(to);
    contacts.push({ to, name: rest.join(' ').replace(/\s+/g, ' ').trim() });
  });
  return { contacts, skipped: lines - contacts.length };
}

function checkPassword(p) {
  if (!ADMIN_PASSWORD || typeof p !== 'string') return false;
  const a = Buffer.from(p);
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Envío de anuncios - Agua Viva Surco</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px 16px 60px;color:#222}
h1{font-size:1.4rem} label{display:block;margin:14px 0 4px;font-weight:600;font-size:.95rem}
input[type=text],input[type=password],textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbb;border-radius:8px;font-size:1rem}
.chk{font-weight:400;display:flex;gap:8px;align-items:center}
button{margin-top:18px;padding:12px 22px;background:#075E54;color:#fff;border:0;border-radius:8px;font-size:1rem;cursor:pointer}
button:disabled{opacity:.5} pre{white-space:pre-wrap;background:#f4f4f4;padding:12px;border-radius:8px;font-size:.9rem}
.nota{color:#666;font-size:.85rem}
</style></head><body>
<h1>Envío de anuncios</h1>
<p class="nota">Solo para personas que aceptaron recibir mensajes de la iglesia. La plantilla debe estar aprobada en Meta.</p>
<label for="pw">Contraseña</label><input type="password" id="pw" autocomplete="current-password">
<label for="tpl">Nombre de la plantilla</label><input type="text" id="tpl" placeholder="invitacion_reset_octubre">
<label for="lang">Idioma de la plantilla (código)</label><input type="text" id="lang" value="es">
<label class="chk"><input type="checkbox" id="usevar"> La plantilla usa {{1}} para el nombre</label>
<label for="contacts">Contactos (uno por línea: número, nombre)</label>
<textarea id="contacts" rows="10" placeholder="51961871143, María&#10;987654321, Juan"></textarea>
<p class="nota">Si el número tiene 9 dígitos, se le agrega 51 (Perú). Máximo ${MAX_BROADCAST} por envío.</p>
<button id="send">Enviar anuncio</button>
<pre id="out"></pre>
<script>
document.getElementById('send').onclick = async function () {
  var btn = this, out = document.getElementById('out');
  var contacts = document.getElementById('contacts').value;
  var n = contacts.split(/\\n/).filter(function (l) { return l.trim(); }).length;
  if (!n) { out.textContent = 'Pega al menos un contacto.'; return; }
  if (!confirm('¿Enviar el anuncio a ' + n + ' contacto(s)?')) return;
  btn.disabled = true; out.textContent = 'Enviando… no cierres esta página.';
  try {
    var r = await fetch('/admin/send', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('pw').value, template: document.getElementById('tpl').value,
        lang: document.getElementById('lang').value, useVar: document.getElementById('usevar').checked, contacts: contacts }) });
    var d = await r.json();
    if (!r.ok) { out.textContent = 'Error: ' + (d.error || r.status); }
    else {
      var t = 'Enviados: ' + d.sent + ' de ' + d.total + '\\nIgnorados (número inválido o repetido): ' + d.skipped;
      if (d.failed.length) { t += '\\n\\nFallaron ' + d.failed.length + ':'; d.failed.forEach(function (f) { t += '\\n' + f.to + ' → ' + f.error; }); }
      out.textContent = t;
    }
  } catch (e) { out.textContent = 'Error de conexión: ' + e.message; }
  btn.disabled = false;
};
</script></body></html>`;

app.get('/admin', (req, res) => res.type('html').send(ADMIN_HTML));

app.post('/admin/send', async (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Falta configurar ADMIN_PASSWORD en Railway' });
  const { password, template, lang, useVar, contacts } = req.body || {};
  if (!checkPassword(password)) return res.status(401).json({ error: 'Contraseña incorrecta' });
  if (!template || typeof template !== 'string' || !template.trim()) {
    return res.status(400).json({ error: 'Falta el nombre de la plantilla' });
  }
  const parsed = parseContacts(contacts);
  if (!parsed.contacts.length) return res.status(400).json({ error: 'No hay contactos válidos' });
  if (parsed.contacts.length > MAX_BROADCAST) {
    return res.status(400).json({ error: `Máximo ${MAX_BROADCAST} contactos por envío` });
  }

  let sent = 0;
  const failed = [];
  for (const c of parsed.contacts) {
    try {
      await sendTemplate(c.to, template.trim(), (lang || 'es').trim(), useVar ? c.name || 'hermano(a)' : null);
      sent++;
    } catch (e) {
      failed.push({ to: c.to, error: e.response?.data?.error?.message || e.message });
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  res.json({ total: parsed.contacts.length, sent, skipped: parsed.skipped, failed });
});

// ==== Verificación del Webhook ====
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ==== Recepción de mensajes entrantes ====
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    const waId = message.from;

    if (message.type === 'text') {
      await handleMessage(waId, message.text.body, null);
    } else if (message.type === 'interactive') {
      if (message.interactive?.button_reply) {
        await handleMessage(waId, message.interactive.button_reply.title, message.interactive.button_reply.id);
      } else if (message.interactive?.list_reply) {
        await handleMessage(waId, message.interactive.list_reply.title, message.interactive.list_reply.id);
      }
    }
  } catch (err) {
    console.error('Error procesando mensaje:', err.response?.data || err.message);
  }
});

app.get('/', (req, res) => res.send('Bot Agua Viva Surco activo ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
