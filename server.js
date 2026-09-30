const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ==== Variables de entorno ====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GRAPH_URL = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

// ==== Respuestas del bot ====
const answers = {
  next: '🕕 *NEXT (jóvenes):* sábados, 6:00 p.m.',
  familiar: '🕘 *Servicio Familiar:* domingos, 9:00 a.m., 11:00 a.m. y 6:00 p.m.',
  intercesion: '🙏 *Intercesión:* sábado, 6:30 a.m.',
  lideres:
    '📚 *Escuela de líderes:*\nLunes: Discipulados 1, 2 y 3 — 8:00 p.m.\nMartes: Líderes 1, 2 y 3 — 8:00 p.m.\nMiércoles: Seminario Intercesión y Guerra Espiritual — 8:00 p.m.',
  direccion:
    '📍 *Sede Surco:* Víctor Plascencia 181 (Ref. Estación Jorge Chávez). Pastores: Diego y Brigitte García.',
  reset:
    '🔥 *Próximo Reset publicado:*\nCamp Next (12 a 17 años): 31 de julio al 2 de agosto.\nSiguiente: Reset Mujeres (26 a 65 años), 7 al 9 de agosto.\n(Cronograma sujeto a confirmación, ver ccaguaviva.org/reset)',
  saludo: '🙌 ¡Bienvenido(a) a Agua Viva Surco! Que la paz y las bendiciones de Dios estén contigo hoy.',
  despedida:
    '🙏 Gracias a ti. Que el Señor te acompañe y te bendiga en todo lo que emprendas hoy. ¡Esperamos verte pronto en Agua Viva Surco!',
  ayuda: 'Toca el botón de abajo para ver las opciones disponibles 👇',
};

// Filas del menú (id -> título y descripción que se ven en la lista de WhatsApp)
const menuRows = [
  { id: 'next', title: 'NEXT', description: 'Reunión de jóvenes' },
  { id: 'familiar', title: 'Familiar', description: 'Servicio dominical' },
  { id: 'intercesion', title: 'Intercesión', description: 'Horario de oración' },
  { id: 'lideres', title: 'Escuela de líderes', description: 'Horarios de clases' },
  { id: 'direccion', title: 'Dirección', description: 'Ubicación de la sede' },
  { id: 'reset', title: 'Reset', description: 'Próximo evento' },
  { id: 'conexion', title: 'Grupo de conexión', description: '¿Ya tienes uno?' },
];

const keywords = [
  [/^(hola|buen[oa]s?\s?(d[ií]as|tardes|noches)|saludos|hey|qu[eé]\s?tal|dios te bendiga|paz de dios|bendiciones)/i, 'saludo'],
  [/gracias|chau|chao|bye|adi[oó]s|hasta luego|nos vemos/i, 'despedida'],
  [/menu|opciones|ayuda/i, 'menu'],
  [/next/i, 'next'],
  [/famil/i, 'familiar'],
  [/domin/i, 'familiar'],
  [/interces/i, 'intercesion'],
  [/l[ií]der/i, 'lideres'],
  [/direcc|ubicaci|donde/i, 'direccion'],
  [/reset/i, 'reset'],
  [/conexi[oó]n|grupo/i, 'conexion'],
];

// ==== Estado de conversación por usuario (en memoria) ====
const sessions = new Map(); // wa_id -> { flow, tempName }

function getSession(waId) {
  if (!sessions.has(waId)) sessions.set(waId, { flow: null, tempName: '' });
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

// ==== Envío del menú como lista interactiva ====
async function sendMenu(to, bodyText) {
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

// ==== Envío de botones rápidos (Sí / No) ====
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

// ==== Lógica principal ====
async function handleMessage(waId, text, interactiveId) {
  const session = getSession(waId);
  const val = (text || '').trim();

  // Respuesta de botones Sí/No (Grupo de conexión)
  if (interactiveId === 'si') {
    session.flow = null;
    await sendText(
      waId,
      '🙏 ¡Qué alegría saber que ya formas parte de un Grupo de Conexión! Que sigas creciendo junto a tu grupo y experimentando el amor de Dios cada día. Dios te bendiga.'
    );
    return;
  }
  if (interactiveId === 'no') {
    session.flow = 'nombre';
    await sendText(waId, 'Con gusto te contactamos. Por favor escribe tus *nombres completos*:');
    return;
  }

  // Selección desde el menú de lista
  if (interactiveId === 'conexion') {
    await sendYesNo(waId, '¿Tienes Grupo de Conexión?');
    return;
  }
  if (interactiveId && answers[interactiveId]) {
    await sendText(waId, answers[interactiveId]);
    return;
  }

  // Flujo activo: esperando nombre
  if (session.flow === 'nombre') {
    session.tempName = val;
    session.flow = 'celular';
    await sendText(waId, 'Gracias. Ahora escribe tu *número de celular*:');
    return;
  }

  // Flujo activo: esperando celular
  if (session.flow === 'celular') {
    const nombre = session.tempName;
    session.flow = null;
    session.tempName = '';
    await sendText(
      waId,
      `¡Gracias, ${nombre}! 🙌 Ya registramos tus datos (${nombre} — ${val}) y muy pronto alguien de nuestro equipo te contactará para conectarte con un Grupo de Conexión. Dios te bendiga.`
    );
    return;
  }

  // Texto libre: buscar palabra clave
  const match = keywords.find(([re]) => re.test(val));
  const key = match ? match[1] : null;

  if (key === 'saludo') {
    await sendText(waId, answers.saludo);
    await sendMenu(waId, '¿En qué puedo ayudarte hoy?');
    return;
  }
  if (key === 'menu') {
    await sendMenu(waId, 'Elige una opción:');
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
  await sendMenu(waId, 'Elige una opción:');
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
