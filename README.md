# Bot WhatsApp — Agua Viva Surco

## 1. Desplegar en Railway (recomendado, gratis para empezar)

1. Crea una cuenta en https://railway.app (puedes entrar con GitHub).
2. Sube esta carpeta a un repositorio de GitHub (o usa "Deploy from local folder" si Railway lo ofrece en tu cuenta).
3. En Railway: **New Project → Deploy from GitHub repo** → selecciona el repo.
4. En la pestaña **Variables**, agrega las 3 variables de `.env.example` con tus valores reales:
   - `VERIFY_TOKEN`
   - `WHATSAPP_TOKEN`
   - `PHONE_NUMBER_ID`
5. Railway detecta `package.json` y lo despliega solo. Al terminar, te da una URL pública, algo como:
   `https://bot-agua-viva-surco-production.up.railway.app`

(Render.com funciona igual: "New Web Service" → conectar el repo → agregar las mismas variables de entorno → Deploy.)

## 2. Configurar el Webhook en Meta

1. Ve a tu app en https://developers.facebook.com → **WhatsApp → Configuración**.
2. En "Webhook", haz clic en **Editar**.
3. **URL de devolución de llamada:** tu URL de Railway/Render + `/webhook`
   Ejemplo: `https://bot-agua-viva-surco-production.up.railway.app/webhook`
4. **Verify token:** el mismo valor que pusiste en `VERIFY_TOKEN`.
5. Clic en **Verificar y guardar**. Si todo está bien, Meta mostrará "Verificado ✅".
6. En la lista de campos del webhook, activa (suscríbete a) **messages**.

## 3. Probar

Escribe al número de WhatsApp conectado desde tu celular:
- "Hola" → saludo de bienvenida
- "NEXT", "Familiar", "Intercesión", "Escuela de líderes", "Dirección", "Reset" → info correspondiente
- "Grupo de conexión" → pregunta con botones Sí/No y, si es No, pide nombre y celular
- "Gracias" / "Chau" → despedida

## Notas

- El estado de la conversación (para el flujo de Grupo de Conexión) se guarda en memoria del servidor.
  Si el servidor se reinicia a mitad de un flujo, ese usuario tendría que empezar de nuevo. Para una
  iglesia con volumen moderado esto normalmente no es un problema; si más adelante quieres que sea
  100% persistente, se puede migrar ese estado a una base de datos.
- Los datos de "Grupo de Conexión" (nombre y celular) solo se muestran de vuelta al usuario como
  confirmación. Si quieres que además se guarden en una hoja de cálculo o base de datos para que el
  equipo de la iglesia haga seguimiento, dímelo y lo agregamos.
