// lib/db.js — acceso a Supabase (solo servidor)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

const SESION_MIN = 10; // minutos que el bot espera el DNI/CE

async function fichaPorDocumento(documento) {
  const { data, error } = await supabase
    .from('v_ficha').select('*').eq('documento', documento).maybeSingle();
  if (error) throw error;
  return data;
}

async function getSesion(telefono) {
  const { data, error } = await supabase
    .from('sesiones').select('*').eq('telefono', telefono).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const vencida = Date.now() - new Date(data.actualizado).getTime() > SESION_MIN * 60000;
  if (vencida) { await borrarSesion(telefono); return null; }
  return data;
}

async function setSesion(telefono, intencion) {
  const { error } = await supabase.from('sesiones')
    .upsert({ telefono, intencion, actualizado: new Date().toISOString() });
  if (error) throw error;
}

async function borrarSesion(telefono) {
  await supabase.from('sesiones').delete().eq('telefono', telefono);
}

module.exports = { supabase, fichaPorDocumento, getSesion, setSesion, borrarSesion };
