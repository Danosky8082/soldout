const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function uploadToSupabase(file, folder) {
  const fileExt = path.extname(file.originalname);
  const fileName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
  const { data, error } = await supabase.storage
    .from('uploads')
    .upload(fileName, file.buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.mimetype,
    });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(fileName);
  return publicUrl;
}

function getAbsoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const STATIC_BASE_URL = process.env.STATIC_BASE_URL || 'https://soldout-jh33.onrender.com';
  return url.startsWith('/') ? `${STATIC_BASE_URL}${url}` : `${STATIC_BASE_URL}/${url}`;
}

module.exports = { uploadToSupabase, getAbsoluteUrl };