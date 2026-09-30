const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ==== Variables de entorno (configúralas en tu hosting) ====
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;        // inventas tú una palabra clave
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;    // token de acceso de Meta
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;  // Phone Number ID de Meta

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
  saludo:
    '🙌 ¡Bienvenido(a) a Agua Viva Surco! Que la paz y las bendiciones de Dios estén contigo hoy. ¿En qué puedo ayudarte?\n\n*NEXT* · *Familiar* · *Intercesión* · *Escuela de líderes* · *Dirección* · *Reset* · *Grupo de conexión*',
  despedida:
    '🙏 Gracias a ti. Que el Señor te acompañe y te bendiga en todo lo que emprendas hoy. ¡Esperamos verte pronto en Agua Viva Surco!',
  ayuda:
    'Puedo darte info sobre: *NEXT*, *Familiar*, *Intercesión*, *Escuela de líderes*, *Dirección*, *Reset* o *Grupo de conexión*. Escribe cualquiera de esas palabras.',
};

const keywords = [
  [/^(hola|buen[oa]s?\s?(d[ií]as|tardes|noches)|saludos|hey|qu[eé]\s?tal|dios te bendiga|paz de dios|bendiciones)/i, 'saludo'],
  [/gracias|chau|chao|bye|adi[oó]s|hasta luego|nos vemos/i, 'despedida'],
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
// Para producción real con muchos usuarios, reemplaza este Map por una base
// de datos (Redis, Postgres, etc.) para no perder el estado si el servidor reinicia.
const sessions = new Map(); // wa_id -> { flow, tempName }

function getSession(waId) {
  if (!sessions.has(waId)) sessions.set(waId, { flow: null, tempName: '' });
  return sessions.get(waId);
}

// ==== Envío de mensajes de texto simple ====
async function sendText(to, body) {
  await axios.post(
    GRAPH_URL,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
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

// ==== Lógica principal: decide qué responder ====
async function handleMessage(waId, text, buttonId) {
  const session = getSession(waId);
  const val = (text || '').trim();

  // Flujo activo: Grupo de Conexión - esperando Sí/No por botón
  if (buttonId === 'si') {
    session.flow = null;
    await sendText(
      waId,
      '🙏 ¡Qué alegría saber que ya formas parte de un Grupo de Conexión! Que sigas creciendo junto a tu grupo y experimentando el amor de Dios cada día. Dios te bendiga.'
    );
    return;
  }
  if (buttonId === 'no') {
    session.flow = 'nombre';
    await sendText(waId, 'Con gusto te contactamos. Por favor escribe tus *nombres completos*:');
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

  // Sin flujo activo: buscar palabra clave
  const match = keywords.find(([re]) => re.test(val));
  const key = match ? match[1] : null;

  if (key === 'conexion') {
    await sendYesNo(waId, '¿Tienes Grupo de Conexión?');
    return;
  }

  await sendText(waId, answers[key] || answers.ayuda);
}

// ==== Verificación del Webhook (Meta la llama una sola vez al configurar) ====
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('--- Verificación de webhook ---');
  console.log('mode recibido:', JSON.stringify(mode));
  console.log('token recibido:', JSON.stringify(token));
  console.log('token esperado (env):', JSON.stringify(VERIFY_TOKEN));

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ==== Recepción de mensajes entrantes ====
app.post('/webhook', async (req, res) => {
  // Responde 200 de inmediato para que Meta no reintente el mismo evento
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return; // puede ser un evento de "status" (entregado/leído), lo ignoramos

    const waId = message.from; // número del usuario que escribió

    if (message.type === 'text') {
      await handleMessage(waId, message.text.body, null);
    } else if (message.type === 'interactive' && message.interactive?.button_reply) {
      await handleMessage(waId, message.interactive.button_reply.title, message.interactive.button_reply.id);
    }
  } catch (err) {
    console.error('Error procesando mensaje:', err.response?.data || err.message);
  }
});

app.get('/', (req, res) => res.send('Bot Agua Viva Surco activo ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
