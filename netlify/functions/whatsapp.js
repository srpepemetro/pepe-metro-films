const SYSTEM_PROMPT = `Eres el asistente virtual de Pepe Metro Films, videógrafo profesional en Sevilla.
Te llamas "Asistente de Pepe" y respondes cuando Pepe no está disponible.
Tutea siempre. Tono cercano, profesional y cálido. Respuestas cortas (máximo 3-4 frases).

SERVICIOS QUE OFRECE PEPE (solo para tu contexto, NO los menciones directamente):
- Bodas, Videoclips, Aftermovie / DJ, Corporativo, Fashion / Editorial

SOBRE LOS PRECIOS — MUY IMPORTANTE:
- NUNCA des precios en el primer mensaje ni de forma proactiva.
- Primero entiende qué necesita el cliente: qué tipo de proyecto, para qué fecha, dónde.
- Solo si el cliente pregunta directamente por precio, di que "depende del proyecto y los detalles" y que Pepe le enviará un presupuesto personalizado una vez hablen.
- Jamás menciones cifras concretas. El precio lo pone Pepe, no tú.

COMPORTAMIENTO ANTE MENSAJES INAPROPIADOS:
- Si el mensaje contiene insultos, lenguaje ofensivo, contenido sexual o acoso: responde UNA sola vez con educación pero firmeza, algo como "Este canal es para consultas profesionales. Si tienes interés en contratar algún servicio, con mucho gusto te ayudo." y no sigas el juego.
- Si persiste con más mensajes inapropiados: responde únicamente "Este número es para consultas profesionales. Hasta luego." y ya no respondas más en esa conversación (ignora mensajes siguientes del mismo contacto).
- Ante bromas o cachondeo sin mala intención: redirígelo amablemente hacia el tema profesional sin ponerte serio en exceso.
- Nunca insultes, nunca te defiendas con agresividad, nunca sigas el juego.

TU OBJETIVO:
1. Responder preguntas sobre servicios, precios y disponibilidad
2. Recoger información clave: tipo de trabajo, fecha aproximada, ubicación
3. Decirle que Pepe le contactará personalmente para confirmar disponibilidad y enviar presupuesto detallado
4. NO confirmar fechas ni cerrar precios exactos — solo orientativos
5. Si preguntan algo que no sabes, di que Pepe responderá en persona

ZONA DE TRABAJO: principalmente Sevilla y Andalucía, pero viaja a toda España.

Responde siempre en español. Si te escriben en otro idioma, responde en ese idioma.`;

const MAX_HISTORY   = 10; // máximo de mensajes guardados por conversación
const TTL_MS        = 24 * 60 * 60 * 1000; // conversación expira tras 24h de inactividad

/* ── Netlify Blobs (memoria de conversaciones) ── */
async function getHistory(store, key) {
  try {
    const raw = await store.get(key, { type: 'json' });
    if (!raw) return [];
    if (Date.now() - raw.ts > TTL_MS) return []; // expirado
    return raw.messages || [];
  } catch { return []; }
}

async function saveHistory(store, key, messages) {
  try {
    await store.set(key, JSON.stringify({ messages, ts: Date.now() }));
  } catch { /* degradar sin errores */ }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'OK' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 200, body: 'OK' }; }

  if (body.typeWebhook !== 'incomingMessageReceived') {
    return { statusCode: 200, body: 'OK' };
  }

  const msg = body.body;
  if (!msg || msg.typeMessage !== 'textMessage') {
    return { statusCode: 200, body: 'OK' };
  }

  const chatId     = msg.senderData?.chatId;
  const senderName = msg.senderData?.senderName || '';
  const text       = msg.messageData?.textMessageData?.textMessage || '';

  if (!chatId || !text) return { statusCode: 200, body: 'OK' };

  const idInstance = process.env.GREEN_API_INSTANCE;
  const apiToken   = process.env.GREEN_API_TOKEN;
  const groqKey    = process.env.GROQ_API_KEY;

  const sendMsg = (toChat, message) =>
    fetch(`https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: toChat, message }),
    });

  try {
    // Cargar historial de conversación
    let history = [];
    let store;
    try {
      const { getStore } = require('@netlify/blobs');
      store = getStore('whatsapp-conversations');
      const safeKey = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
      history = await getHistory(store, safeKey);

      // Añadir mensaje entrante al historial
      history.push({
        role: 'user',
        content: senderName ? `[${senderName}]: ${text}` : text,
      });

      // Llamar a Groq con historial completo
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history.slice(-MAX_HISTORY),
          ],
          max_tokens: 350,
          temperature: 0.65,
        }),
      });

      const groqData = await groqRes.json();
      const reply = groqData.choices?.[0]?.message?.content?.trim();
      if (!reply) return { statusCode: 200, body: 'OK' };

      // Guardar respuesta en historial y persistir
      history.push({ role: 'assistant', content: reply });
      const trimmed = history.slice(-MAX_HISTORY);
      await saveHistory(store, safeKey, trimmed);

      // Enviar respuesta al cliente
      await sendMsg(chatId, reply);

      // Notificar a Pepe
      const senderNum = chatId.replace('@c.us', '');
      const alerta = `📩 Nuevo mensaje en el negocio\n👤 ${senderName || 'Desconocido'} (${senderNum})\n💬 "${text}"\n\n🤖 Respondí: "${reply}"`;
      await sendMsg('34664790009@c.us', alerta);

    } catch (blobErr) {
      // Si Blobs falla, responder sin memoria (fallback)
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: senderName ? `[${senderName}]: ${text}` : text },
          ],
          max_tokens: 350,
          temperature: 0.65,
        }),
      });
      const groqData = await groqRes.json();
      const reply = groqData.choices?.[0]?.message?.content?.trim();
      if (!reply) return { statusCode: 200, body: 'OK' };

      await sendMsg(chatId, reply);
      const senderNum = chatId.replace('@c.us', '');
      const alerta = `📩 Nuevo mensaje en el negocio\n👤 ${senderName || 'Desconocido'} (${senderNum})\n💬 "${text}"\n\n🤖 Respondí: "${reply}"`;
      await sendMsg('34664790009@c.us', alerta);
    }

  } catch (err) {
    console.error('Bot error:', err);
  }

  return { statusCode: 200, body: 'OK' };
};
