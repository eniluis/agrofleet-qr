import { RANCH_NAMES, WORKSHOP_WHATSAPP_PHONE, state } from './config.js';
import { sbFetch, enqueueOfflineAction, showToast, handleAppError, uploadImageToSupabaseStorage } from './api.js';

let selectedPreventiveTags = new Set();
let localFaultPriority = 'NORMAL';
let localResolutionStatus = 'FINALIZADO';
let localRole2Photos = [];
let localRole3Photos = [];

export function sendTicketWhatsAppAlert({ idTractor, idRancho, prioridad, descripcion, tipoOrigen = 'REPORTE DE CAMPO' }) {
    const ranchoLabel = RANCH_NAMES[idRancho] || idRancho || 'Sin especificar';
    const fechaHora = new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

    const msg = [
        `🚨 *ALERTA AGROFLEET QR · ORDEN ${prioridad}*`,
        `• *Origen:* ${tipoOrigen}`,
        `• *Unidad:* #${idTractor}`,
        `• *Ubicación:* ${ranchoLabel}`,
        `• *Detalle:* ${descripcion}`,
        `• *Hora:* ${fechaHora}`,
        ``,
        `_Favor de atender en bandeja de Taller AgroFleet._`
    ].join('\n');

    const phone = (WORKSHOP_WHATSAPP_PHONE || '').replace(/\D/g, '');
    const baseUrl = phone && !WORKSHOP_WHATSAPP_PHONE.includes('X') ? `https://wa.me/${phone}` : `https://wa.me/`;
    const url = `${baseUrl}?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
}

export function setPriority(prio) {
    localFaultPriority = prio;
    state.currentFaultPriority = prio;
    const btnNorm = document.getElementById('prio-normal');
    const btnUrg = document.getElementById('prio-urgente');
    if (!btnNorm || !btnUrg) return;

    if (prio === 'URGENTE') {
        btnUrg.className = 'py-2.5 px-3 rounded-xl border-2 border-red-600 bg-red-600 text-white font-extrabold text-xs transition shadow-sm';
        btnNorm.className = 'py-2.5 px-3 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-xs transition';
    } else {
        btnNorm.className = 'py-2.5 px-3 rounded-xl border-2 border-forest bg-forest text-white font-extrabold text-xs transition shadow-sm';
        btnUrg.className = 'py-2.5 px-3 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-xs transition';
    }
}

export function togglePreventiveTag(code) {
    const btn = document.getElementById(`pm-btn-${code}`);
    if (!btn) return;

    if (selectedPreventiveTags.has(code)) {
        selectedPreventiveTags.delete(code);
        btn.className = 'py-2 px-1.5 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-[10px] leading-tight text-center transition';
    } else {
        selectedPreventiveTags.add(code);
        btn.className = 'py-2 px-1.5 rounded-xl border-2 border-emeraldAgro bg-emerald-100 text-forest font-extrabold text-[10px] leading-tight text-center transition';
    }
}

function resetPreventiveTagsUI() {
    selectedPreventiveTags.clear();
    ['300', '500', '1000'].forEach(code => {
        const btn = document.getElementById(`pm-btn-${code}`);
        if (btn) {
            btn.className = 'py-2 px-1.5 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-[10px] leading-tight text-center transition';
        }
    });
}

export async function handlePhotoUpload(event, targetRole) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const imageUrl = await uploadImageToSupabaseStorage(file, targetRole);
        if (targetRole === 'role2') {
            localRole2Photos.push(imageUrl);
            renderDraftPhotoGrid('role2');
        } else {
            localRole3Photos.push(imageUrl);
            renderDraftPhotoGrid('role3');
        }
    } catch (e) {
        showToast('No se pudo procesar la imagen.', 'error');
    }
    event.target.value = '';
}

export function removeDraftPhoto(targetRole, index) {
    if (targetRole === 'role2') {
        localRole2Photos.splice(index, 1);
        renderDraftPhotoGrid('role2');
    } else {
        localRole3Photos.splice(index, 1);
        renderDraftPhotoGrid('role3');
    }
}

export function renderDraftPhotos(targetRole) {
    if (!targetRole) {
        renderDraftPhotoGrid('role2');
        renderDraftPhotoGrid('role3');
        return;
    }
    renderDraftPhotoGrid(targetRole);
}

function renderDraftPhotoGrid(targetRole) {
    const grid = document.getElementById(`${targetRole}-photo-grid`);
    if (!grid) return;
    const photos = targetRole === 'role2' ? localRole2Photos : localRole3Photos;
    const borderColor = targetRole === 'role2' ?
        'border-barnTerra/60 bg-orange-50/50 text-barnTerra' :
        'border-emeraldAgro/60 bg-emerald-50/50 text-emeraldAgro';
    const labelText = targetRole === 'role2' ? 'Tomar / Subir Foto' : 'Foto Reparación';

    const thumbs = photos.map((src, idx) => `
    <div class="relative aspect-square rounded-xl overflow-hidden border border-stone-300 bg-stone-100">
      <img src="${src}" class="w-full h-full object-cover" />
      <button type="button" onclick="removeDraftPhoto('${targetRole}', ${idx})"
        class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 text-white text-[10px] font-bold flex items-center justify-center">✕</button>
    </div>
  `).join('');

    grid.innerHTML = thumbs + `
    <label class="aspect-square rounded-xl border-2 border-dashed ${borderColor} flex flex-col items-center justify-center cursor-pointer p-2 text-center">
      <span class="text-lg">📷</span>
      <span class="text-[10px] font-bold mt-1 leading-tight">${labelText}</span>
      <input type="file" accept="image/*" capture="environment" class="hidden" onchange="handlePhotoUpload(event, '${targetRole}')" />
    </label>
  `;
}

export async function submitMaintenanceRequest(syncFn) {
    if (!state.selectedTractorId) {
        showToast('Selecciona o escanea un tractor primero.', 'error');
        return;
    }
    const desc = document.getElementById('input-fault-desc').value.trim();
    if (!desc) {
        showToast('Describe la falla reportada.', 'error');
        document.getElementById('input-fault-desc').focus();
        return;
    }

    const ranchoReporte = document.getElementById('select-fault-rancho').value;
    const prioridadActual = localFaultPriority || 'NORMAL';
    const tractorReporte = state.selectedTractorId;
    const btn = document.getElementById('btn-submit-fault');
    btn.disabled = true;
    btn.textContent = 'ENVIANDO AL TALLER...';

    const payload = {
        id_tractor: tractorReporte,
        id_rancho_reporte: ranchoReporte,
        prioridad: prioridadActual,
        descripcion_falla: desc,
        estatus: 'PENDIENTE',
        id_usuario_solicita: state.currentUser.id_usuario
    };

    try {
        if (state.isOnline) {
            const inserted = await sbFetch('servicios_mantenimiento', {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify(payload)
            });
            const newTicket = inserted && inserted[0];
            if (newTicket && localRole2Photos.length > 0) {
                const photoPayloads = localRole2Photos.map(img => ({
                    id_servicio: newTicket.id_servicio,
                    tipo_evidencia: 'FALLA_INICIAL',
                    imagen_base64: img
                }));
                await sbFetch('evidencias_servicio', { method: 'POST', body: JSON.stringify(photoPayloads) });
            }
            if (syncFn) await syncFn(false);
            showToast(`✔ Reporte de falla enviado al taller para #${tractorReporte}.`, 'success');
        } else {
            enqueueOfflineAction({ table: 'servicios_mantenimiento', payload });
            state.dbTickets.unshift({...payload, id_servicio: 'LOCAL', fecha_solicitud: new Date().toISOString() });
            showToast('⏳ Sin señal: reporte guardado localmente.', 'info');
        }

        if (prioridadActual === 'URGENTE') {
            sendTicketWhatsAppAlert({
                idTractor: tractorReporte,
                idRancho: ranchoReporte,
                prioridad: 'URGENTE',
                descripcion: desc,
                tipoOrigen: 'REPORTE DE FALLA EN CAMPO'
            });
        }

        document.getElementById('input-fault-desc').value = '';
        localRole2Photos = [];
        renderDraftPhotoGrid('role2');
        renderRole2MyTickets();
    } catch (err) {
        handleAppError('Envío de reporte', err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'ENVIAR PETICIÓN AL TALLER';
    }
}

export function renderRole2MyTickets() {
    const list = document.getElementById('role2-my-tickets-list');
    if (!list || !state.currentUser) return;

    const mine = (state.dbTickets || []).filter(t =>
        state.currentUser.rol === 'ADMIN' || t.id_usuario_solicita === state.currentUser.id_usuario
    ).slice(0, 15);

    if (mine.length === 0) {
        list.innerHTML = `<p class="text-xs text-stone-400 text-center py-2">Aún no hay peticiones enviadas.</p>`;
        return;
    }

    list.innerHTML = mine.map(t => {
                const statusBadge = t.estatus === 'FINALIZADO' ?
                    'bg-emerald-100 text-emerald-800' :
                    t.estatus === 'EN_ESPERA' ?
                    'bg-amber-100 text-barnTerra' :
                    'bg-red-100 text-red-800';

                return `
      <div class="bg-creamSand rounded-xl p-2.5 border border-stone-200 text-xs space-y-1">
        <div class="flex items-center justify-between">
          <strong class="text-forest font-extrabold">#${t.id_tractor} · Ticket #${t.id_servicio}</strong>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${statusBadge}">${t.estatus}</span>
        </div>
        <p class="text-stone-700">${t.descripcion_falla}</p>
        ${t.trabajo_realizado ? `<p class="text-[11px] text-emeraldAgro font-semibold">✔ Taller: ${t.trabajo_realizado}</p>` : ''}
      </div>
    `;
  }).join('');
}

export function renderRole3TicketList() {
  const list = document.getElementById('role3-tickets-list');
  const badge = document.getElementById('role3-open-badge');
  if (!list) return;

  const openTickets = (state.dbTickets || []).filter(t => t.estatus !== 'FINALIZADO');
  if (badge) badge.textContent = `${openTickets.length} abierta${openTickets.length === 1 ? '' : 's'}`;

  if (openTickets.length === 0) {
    list.innerHTML = `<div class="bg-white rounded-2xl p-6 text-center border border-stone-200 text-xs text-stone-500">✔ No hay fallas pendientes por reparar en este momento.</div>`;
    return;
  }

  list.innerHTML = openTickets.map(t => {
    const isUrg = t.prioridad === 'URGENTE';
    const waPayload = JSON.stringify({
      idTractor: t.id_tractor,
      idRancho: t.id_rancho_reporte,
      prioridad: t.prioridad,
      descripcion: t.descripcion_falla
    }).replace(/'/g, '');

    return `
      <div class="bg-white rounded-2xl p-3.5 border ${isUrg ? 'border-red-400' : 'border-stone-200'} shadow-sm space-y-2 text-xs">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <strong class="text-forest font-extrabold text-sm">#${t.id_tractor}</strong>
            <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${isUrg ? 'bg-red-100 text-red-800' : 'bg-stone-100 text-stone-700'}">${t.prioridad}</span>
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-barnTerra">${t.estatus}</span>
        </div>
        <p class="text-stone-800 font-semibold">${t.descripcion_falla}</p>
        <div class="flex items-center justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100 gap-2">
          <span class="truncate">Rancho: ${RANCH_NAMES[t.id_rancho_reporte] || t.id_rancho_reporte}</span>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" onclick='notifyTicketWhatsApp(${waPayload})'
              class="px-2.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-forest font-extrabold text-xs transition">
              📲 WhatsApp
            </button>
            <button type="button" onclick="openTicketForRepair(${t.id_servicio})"
              class="px-3 py-1.5 rounded-xl bg-emeraldAgro hover:bg-forest text-white font-extrabold text-xs transition">
              Atender / Cerrar →
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

export function openTicketForRepair(idServicio) {
  const ticket = (state.dbTickets || []).find(t => t.id_servicio === idServicio);
  if (!ticket) return;

  state.activeRepairTicketId = idServicio;
  resetPreventiveTagsUI();

  document.getElementById('close-ticket-badge').textContent = `TICKET #${ticket.id_servicio} · ${ticket.prioridad}`;
  document.getElementById('close-ticket-tractor').textContent = `#${ticket.id_tractor}`;
  document.getElementById('close-ticket-fault').textContent = ticket.descripcion_falla;
  document.getElementById('input-repair-work').value = ticket.trabajo_realizado || '';

  const initPhotos = (state.dbEvidences || []).filter(e => e.id_servicio === idServicio && e.tipo_evidencia === 'FALLA_INICIAL');
  const initBox = document.getElementById('close-ticket-initial-photos');
  const initRow = document.getElementById('close-initial-photos-row');
  if (initPhotos.length > 0) {
    initBox.classList.remove('hidden');
    initRow.innerHTML = initPhotos.map(p => `<img src="${p.imagen_base64}" class="w-16 h-16 rounded-xl object-cover border border-stone-300 shrink-0" />`).join('');
  } else {
    initBox.classList.add('hidden');
  }

  localRole3Photos = [];
  renderDraftPhotoGrid('role3');
  setResolutionStatus('FINALIZADO');

  const panel = document.getElementById('role3-close-panel');
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function closeRole3Panel() {
  state.activeRepairTicketId = null;
  resetPreventiveTagsUI();
  document.getElementById('role3-close-panel').classList.add('hidden');
}

export function setResolutionStatus(status) {
  localResolutionStatus = status;
  state.currentResolutionStatus = status;
  const btnFin = document.getElementById('status-btn-finalizado');
  const btnEsp = document.getElementById('status-btn-espera');
  const waitBox = document.getElementById('wait-reason-box');

  if (status === 'FINALIZADO') {
    btnFin.className = 'py-3 px-2.5 rounded-xl border-2 border-emeraldAgro bg-emerald-50 text-forest font-extrabold text-xs transition text-center';
    btnEsp.className = 'py-3 px-2.5 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-xs transition text-center';
    waitBox.classList.add('hidden');
  } else {
    btnEsp.className = 'py-3 px-2.5 rounded-xl border-2 border-harvestGold bg-amber-50 text-barnTerra font-extrabold text-xs transition text-center';
    btnFin.className = 'py-3 px-2.5 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-xs transition text-center';
    waitBox.classList.remove('hidden');
  }
}

export async function submitRepairClosure(syncFn) {
  if (!state.activeRepairTicketId) return;
  const ticket = (state.dbTickets || []).find(t => t.id_servicio === state.activeRepairTicketId);
  if (!ticket) return;

  const workText = document.getElementById('input-repair-work').value.trim();
  if (!workText) {
    showToast('Describe el trabajo realizado o el diagnóstico.', 'error');
    document.getElementById('input-repair-work').focus();
    return;
  }

  const combinedTags = new Set(selectedPreventiveTags);
  const desc = ticket.descripcion_falla || '';
  if (desc.includes('[AUTO-PM-300H]') || desc.includes('[PM-300H]')) combinedTags.add('300');
  if (desc.includes('[AUTO-PM-500H]') || desc.includes('[PM-500H]')) combinedTags.add('500');
  if (desc.includes('[AUTO-PM-1000H]') || desc.includes('[PM-1000H]')) combinedTags.add('1000');

  if (combinedTags.has('1000')) {
    combinedTags.add('500');
    combinedTags.add('300');
  } else if (combinedTags.has('500')) {
    combinedTags.add('300');
  }

  let finalWorkText = workText;
  if (combinedTags.size > 0) {
    const orderedTags = ['300', '500', '1000'].filter(c => combinedTags.has(c)).map(c => `[PM-${c}H]`).join(' ');
    const horos = (state.dbFuelLogs || [])
      .filter(l => l.id_tractor === ticket.id_tractor && l.horometro !== null && !isNaN(parseFloat(l.horometro)))
      .map(l => parseFloat(l.horometro));
    const maxHoro = horos.length > 0 ? Math.max(...horos) : null;
    const horoTag = maxHoro !== null ? `[HORO:${maxHoro}]` : '';
    finalWorkText = `${orderedTags} ${horoTag} ${workText}`.trim();
  }

  const isFinalized = (localResolutionStatus || 'FINALIZADO') === 'FINALIZADO';

  const patchData = {
    trabajo_realizado: finalWorkText,
    estatus: localResolutionStatus || 'FINALIZADO',
    motivo_espera: localResolutionStatus === 'EN_ESPERA' ? document.getElementById('select-wait-reason').value : null,
    id_usuario_repara: state.currentUser.id_usuario,
    fecha_cierre: isFinalized ? new Date().toISOString() : null
  };

  const btn = document.getElementById('btn-save-repair');
  btn.disabled = true;
  btn.textContent = 'GUARDANDO SERVICIO...';

  try {
    await sbFetch(`servicios_mantenimiento?id_servicio=eq.${state.activeRepairTicketId}`, {
      method: 'PATCH',
      body: JSON.stringify(patchData)
    });

    if (localRole3Photos.length > 0) {
      const photoPayloads = localRole3Photos.map(img => ({
        id_servicio: state.activeRepairTicketId,
        tipo_evidencia: 'REPARACION_TERMINADA',
        imagen_base64: img
      }));
      await sbFetch('evidencias_servicio', { method: 'POST', body: JSON.stringify(photoPayloads) });
    }

    const deletedSiblingIds = new Set();

    if (isFinalized) {
      if (combinedTags.size > 0) {
        const siblingTickets = (state.dbTickets || []).filter(t => {
          if (t.id_tractor !== ticket.id_tractor) return false;
          if (t.id_servicio === state.activeRepairTicketId) return false;
          if (t.estatus === 'FINALIZADO') return false;
          const d = t.descripcion_falla || '';
          const isCovered300 = combinedTags.has('300') && (d.includes('[AUTO-PM-300H]') || d.includes('[PM-300H]'));
          const isCovered500 = combinedTags.has('500') && (d.includes('[AUTO-PM-500H]') || d.includes('[PM-500H]'));
          const isCovered1000 = combinedTags.has('1000') && (d.includes('[AUTO-PM-1000H]') || d.includes('[PM-1000H]'));
          return isCovered300 || isCovered500 || isCovered1000;
        });

        for (const sib of siblingTickets) {
          await sbFetch(`servicios_mantenimiento?id_servicio=eq.${sib.id_servicio}`, {
            method: 'DELETE'
          });
          deletedSiblingIds.add(sib.id_servicio);
        }
      }

      const otherUrgentOpen = (state.dbTickets || []).some(t =>
        t.id_tractor === ticket.id_tractor &&
        t.id_servicio !== state.activeRepairTicketId &&
        !deletedSiblingIds.has(t.id_servicio) &&
        t.estatus !== 'FINALIZADO' &&
        t.prioridad === 'URGENTE'
      );

      if (!otherUrgentOpen) {
        await sbFetch(`tractores?id_tractor=eq.${encodeURIComponent(ticket.id_tractor)}`, {
          method: 'PATCH',
          body: JSON.stringify({ estatus_operativo: 'ACTIVO' })
        });
      }
    }

    closeRole3Panel();
    if (syncFn) await syncFn(false);

    const extraMsg = deletedSiblingIds.size > 0
      ? ` y se depuraron ${deletedSiblingIds.size} orden(es) redundante(s)`
      : '';
    showToast(`✔ Servicio guardado${extraMsg}. Tractor ACTIVO y semáforo en verde.`, 'success');
  } catch (err) {
    handleAppError('Cierre de taller', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'CONFIRMAR Y GUARDAR SERVICIO';
  }
}