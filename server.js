const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ==== Variables de entorno ====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ADMIN_PHONE = process.env.ADMIN_PHONE; // tu número (o el del encargado). Ej: 51961871143

const GRAPH_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

// ==== Respuestas del bot ====
const answers = {
  familiar:
    '🕘 *Servicio Familiar* 🧑\u200d🧑\u200d🧒\u200d🧒\nDomingos:\n7:00 a.m.\n9:00 a.m.\n11:30 a.m. y\n6:00 p.m.',
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
  ayuda: 'Toca el botón de abajo para ver las opciones disponibles 👇',
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

  // --- Botones Sí/No de Grupo de Conexión ---
  if (interactiveId === 'si') {
    session.flow = null;
    await sendText(
      waId,
      '🙏 ¡Qué alegría saber que ya formas parte de un Grupo de Conexión! Que sigas creciendo junto a tu grupo y experimentando el amor de Dios cada día. Dios te bendiga.'
    );
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
    await sendText(waId, answers[interactiveId]);
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
    await sendText(
      waId,
      `¡Gracias, ${tempName}! 🙌 Ya registramos tus datos (${tempName} — ${tempPhone} — ${val}) y muy pronto alguien de nuestro equipo te contactará para poder guiarte en la iglesia. Dios te bendiga.`
    );
    await notifyAdmin('Nuevo integrante', tempName, tempPhone, val, waId);
    session.tempName = '';
    session.tempPhone = '';
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
    await sendText(
      waId,
      `¡Gracias, ${tempName}! 🙌 Ya registramos tus datos (${tempName} — ${tempPhone} — ${val}) y muy pronto alguien de nuestro equipo te contactará para conectarte con un Grupo de Conexión. Dios te bendiga.`
    );
    await notifyAdmin('Interesado en Grupo de Conexión', tempName, tempPhone, val, waId);
    session.tempName = '';
    session.tempPhone = '';
    return;
  }

  // --- Texto libre: buscar palabra clave ---
  const match = keywords.find(([re]) => re.test(val));
  const key = match ? match[1] : null;

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
    await sendText(waId, answers[key]);
    return;
  }

  // No se reconoció nada: mostrar el menú
  await sendText(waId, answers.ayuda);
  await sendMainMenu(waId, 'Elige una opción:');
}

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
