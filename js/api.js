import { SUPABASE_URL, SUPABASE_KEY, OFFLINE_QUEUE_KEY, state } from './config.js';

export function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const colors = {
    success: 'bg-forest text-white border-emerald-400',
    error: 'bg-red-800 text-white border-red-400',
    info: 'bg-stone-800 text-amber-100 border-amber-400/50'
  };
  const div = document.createElement('div');
  div.className = `px-3.5 py-2.5 rounded-xl border text-xs font-semibold shadow-lg ${colors[type] || colors.info}`;
  div.textContent = msg;
  container.innerHTML = '';
  container.appendChild(div);
  setTimeout(() => {
    if (container.contains(div)) container.removeChild(div);
  }, 3800);
}

// Traduce errores técnicos de Supabase/Red a mensajes claros para campo
export function handleAppError(contexto, err) {
  console.error(`[AgroFleet Error - ${contexto}]:`, err);
  const raw = (err && err.message) ? err.message : String(err);

  if (!navigator.onLine || raw.includes('Failed to fetch')) {
    showToast('Sin conexión a internet. Verifica tu señal o usa modo Offline.', 'error');
    return;
  }
  if (raw.includes('23505') || raw.includes('duplicate key')) {
    showToast('Registro duplicado: ese identificador ya existe en la base de datos.', 'error');
    return;
  }
  if (raw.includes('42501') || raw.includes('row-level security')) {
    showToast('Permiso bloqueado en Supabase (revisa políticas RLS de la tabla).', 'error');
    return;
  }
  showToast(`Error en ${contexto}: ${raw.slice(0, 90)}`, 'error');
}

export async function sbFetch(path, options = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function uploadImageToSupabaseStorage(fileObj, folderPrefix) {
  try {
    const cleanName = `${folderPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/evidencias/${cleanName}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': fileObj.type || 'image/jpeg',
        'x-upsert': 'true'
      },
      body: fileObj
    });
    if (!res.ok) throw new Error('Storage upload failed');
    return `${SUPABASE_URL}/storage/v1/object/public/evidencias/${cleanName}`;
  } catch (e) {
    return await compressImageToDataURL(fileObj);
  }
}

function compressImageToDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 640;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==================== COLA OFFLINE ====================
export function loadOfflineQueue() {
  try {
    state.offlineQueue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)) || [];
  } catch (e) {
    state.offlineQueue = [];
  }
  updateOfflineBadge();
}

export function enqueueOfflineAction(action) {
  state.offlineQueue.push(action);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(state.offlineQueue));
  updateOfflineBadge();
}

export function updateOfflineBadge() {
  const badge = document.getElementById('offline-badge');
  if (!badge) return;
  if (state.offlineQueue.length > 0) {
    badge.textContent = state.offlineQueue.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

export async function flushOfflineQueue(onSyncedCallback) {
  if (!state.isOnline || state.offlineQueue.length === 0) return;
  const pending = [...state.offlineQueue];
  state.offlineQueue = [];
  localStorage.setItem(OFFLINE_QUEUE_KEY, '[]');

  let synced = 0;
  for (const item of pending) {
    try {
      await sbFetch(item.table, { method: 'POST', body: JSON.stringify(item.payload) });
      synced++;
    } catch (e) {
      state.offlineQueue.push(item);
    }
  }
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(state.offlineQueue));
  updateOfflineBadge();

  if (synced > 0) {
    if (onSyncedCallback) await onSyncedCallback();
    showToast(`✔ ${synced} registro(s) offline sincronizado(s) con Supabase.`, 'success');
  }
}
