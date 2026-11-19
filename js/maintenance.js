import { RANCH_NAMES, state } from './config.js';
import { sbFetch, uploadImageToSupabaseStorage, enqueueOfflineAction, showToast, handleAppError } from './api.js';

export function setPriority(prio) {
  state.selectedPriority = prio;
  const btnN = document.getElementById('prio-normal');
  const btnU = document.getElementById('prio-urgente');
  if (prio === 'NORMAL') {
    btnN.className = 'py-2.5 px-3 rounded-xl border-2 border-forest bg-emerald-50 text-forest font-extrabold text-xs transition';
    btnU.className = 'py-2.5 px-3 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-xs transition';
  } else {
    btnN.className = 'py-2.5 px-3 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-xs transition';
    btnU.className = 'py-2.5 px-3 rounded-xl border-2 border-red-600 bg-red-50 text-red-700 font-extrabold text-xs transition';
  }
}

export function handlePhotoUpload(event, targetRole) {
  const file = event.target.files[0];
  if (!file) return;
  const previewUrl = URL.createObjectURL(file);
  if (targetRole === 'role2') {
    state.role2DraftFiles.push({ previewUrl, fileObj: file });
    renderDraftPhotos('role2');
  } else {
    state.role3DraftFiles.push({ previewUrl, fileObj: file });
    renderDraftPhotos('role3');
  }
  event.target.value = '';
}

export function renderDraftPhotos(targetRole) {
  const isR2 = targetRole === 'role2';
  const grid = document.getElementById(isR2 ? 'role2-photo-grid' : 'role3-photo-grid');
  if (!grid) return;
  const list = isR2 ? state.role2DraftFiles : state.role3DraftFiles;
  const uploadLabel = grid.firstElementChild;
  grid.innerHTML = '';
  grid.appendChild(uploadLabel);

  list.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'aspect-square rounded-xl overflow-hidden relative border border-stone-300 bg-stone-100';
    div.innerHTML = `
      <img src="${item.previewUrl}" class="w-full h-full object-cover" />
      <button type="button" onclick="removeDraftPhoto('${targetRole}', ${idx})"
        class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 text-white text-[10px] font-bold">✕</button>
    `;
    grid.appendChild(div);
  });
}

export function removeDraftPhoto(targetRole, idx) {
  if (targetRole === 'role2') {
    state.role2DraftFiles.splice(idx, 1);
    renderDraftPhotos('role2');
  } else {
    state.role3DraftFiles.splice(idx, 1);
    renderDraftPhotos('role3');
  }
}

export async function submitMaintenanceRequest(syncFn) {
  if (!state.selectedTractorId) {
    showToast('Selecciona o escanea un tractor primero.', 'error');
    return;
  }
  const desc = document.getElementById('input-fault-desc').value.trim();
  if (!desc) {
    showToast('Escribe la descripción de la falla.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-fault');
  btn.disabled = true;
  btn.textContent = 'ENVIANDO REPORTE Y FOTOS...';

  const payload = {
    id_tractor: state.selectedTractorId,
    id_rancho_reporte: document.getElementById('select-fault-rancho').value,
    prioridad: state.selectedPriority,
    descripcion_falla: desc,
    id_usuario_solicita: state.currentUser.id_usuario,
    estatus: 'PENDIENTE'
  };

  try {
    if (state.isOnline) {
      const inserted = await sbFetch('servicios_mantenimiento', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload)
      });
      const newServiceId = inserted[0].id_servicio;

      for (const item of state.role2DraftFiles) {
        const publicUrl = await uploadImageToSupabaseStorage(item.fileObj, `srv_${newServiceId}_init`);
        await sbFetch('evidencias_servicio', {
          method: 'POST',
          body: JSON.stringify({
            id_servicio: newServiceId,
            etapa: 'PETICION_INICIAL',
            url_imagen: publicUrl,
            subido_por: state.currentUser.id_usuario
          })
        });
      }

      if (state.selectedPriority === 'URGENTE') {
        await sbFetch(`tractores?id_tractor=eq.${encodeURIComponent(state.selectedTractorId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ estatus_operativo: 'EN_TALLER' })
        });
      }

      if (syncFn) await syncFn(false);
      showToast(`✔ Petición #${newServiceId} enviada al taller.`, 'success');
    } else {
      enqueueOfflineAction({ table: 'servicios_mantenimiento', payload });
      showToast('⏳ Petición guardada en cola offline.', 'info');
    }

    document.getElementById('input-fault-desc').value = '';
    state.role2DraftFiles = [];
    renderDraftPhotos('role2');
    renderRole2MyTickets();
  } catch (err) {
    handleAppError('Petición de mantenimiento', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ENVIAR PETICIÓN AL TALLER';
  }
}

export function renderRole2MyTickets() {
  const container = document.getElementById('role2-my-tickets-list');
  if (!container || !state.currentUser) return;
  const mine = state.dbTickets.filter(t => t.id_usuario_solicita === state.currentUser.id_usuario);
  if (mine.length === 0) {
    container.innerHTML = `<p class="text-xs text-stone-500 text-center py-2">Sin peticiones registradas aún.</p>`;
    return;
  }
  container.innerHTML = mine.map(t => `
    <div class="bg-creamSand rounded-xl p-2.5 border border-stone-200 text-xs space-y-1">
      <div class="flex justify-between items-center">
        <strong class="text-forest">Ticket #${t.id_servicio} · #${t.id_tractor}</strong>
        <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full ${t.estatus === 'FINALIZADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-barnTerra'}">${t.estatus}</span>
      </div>
      <p class="text-stone-700">${t.descripcion_falla}</p>
    </div>
  `).join('');
}

export function renderRole3TicketList() {
  const container = document.getElementById('role3-tickets-list');
  const badge = document.getElementById('role3-open-badge');
  if (!container) return;

  const openTickets = state.dbTickets.filter(t => t.estatus !== 'FINALIZADO');
  badge.textContent = `${openTickets.length} abierta${openTickets.length === 1 ? '' : 's'}`;

  if (openTickets.length === 0) {
    container.innerHTML = `<div class="bg-white rounded-2xl p-6 text-center border border-stone-200 text-xs text-stone-500">No hay peticiones abiertas en taller.</div>`;
    return;
  }

  container.innerHTML = openTickets.map(t => {
    const tr = state.dbTractors.find(x => x.id_tractor === t.id_tractor);
    const isSel = state.activeTicketIdForRole3 === t.id_servicio;
    return `
      <button type="button" onclick="openTicketForRepair(${t.id_servicio})"
        class="w-full text-left bg-white hover:bg-emerald-50/40 rounded-2xl p-3.5 border-2 ${isSel ? 'border-emeraldAgro' : 'border-stone-200'} shadow-sm space-y-1.5 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-extrabold px-2 py-0.5 rounded bg-forest text-white">#${t.id_tractor} · Ticket #${t.id_servicio}</span>
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full ${t.prioridad === 'URGENTE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-barnTerra'}">
            ${t.estatus === 'EN_ESPERA' ? `⏳ ${t.motivo_espera}` : t.prioridad}
          </span>
        </div>
        <h4 class="font-bold text-stone-900 text-sm">${tr ? tr.modelo : t.id_tractor}</h4>
        <p class="text-xs text-stone-600 line-clamp-2">${t.descripcion_falla}</p>
        <div class="flex justify-between text-[10px] text-stone-400 pt-1 border-t border-stone-100">
          <span>Rancho reporte: ${RANCH_NAMES[t.id_rancho_reporte] || 'N/A'}</span>
          <span class="font-bold text-emeraldAgro">Atender / Cerrar →</span>
        </div>
      </button>
    `;
  }).join('');
}

export function openTicketForRepair(idServicio) {
  const ticket = state.dbTickets.find(t => t.id_servicio === idServicio);
  if (!ticket) return;
  state.activeTicketIdForRole3 = idServicio;
  renderRole3TicketList();

  const tr = state.dbTractors.find(x => x.id_tractor === ticket.id_tractor);
  const panel = document.getElementById('role3-close-panel');
  panel.classList.remove('hidden');

  document.getElementById('close-ticket-badge').textContent = `TICKET #${ticket.id_servicio} · ${ticket.prioridad}`;
  document.getElementById('close-ticket-tractor').textContent = `#${ticket.id_tractor} · ${tr ? tr.modelo : ''}`;
  document.getElementById('close-ticket-fault').textContent = ticket.descripcion_falla;
  document.getElementById('input-repair-work').value = ticket.trabajo_realizado || '';

  const initPhotos = state.dbEvidences.filter(e => e.id_servicio === idServicio && e.etapa === 'PETICION_INICIAL');
  const initBox = document.getElementById('close-ticket-initial-photos');
  const initRow = document.getElementById('close-initial-photos-row');
  if (initPhotos.length > 0) {
    initBox.classList.remove('hidden');
    initRow.innerHTML = initPhotos.map(p => `<img src="${p.url_imagen}" class="w-16 h-16 rounded-xl object-cover border border-stone-300 shrink-0" />`).join('');
  } else {
    initBox.classList.add('hidden');
  }

  state.role3DraftFiles = [];
  renderDraftPhotos('role3');
  setResolutionStatus('FINALIZADO');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function closeRole3Panel() {
  state.activeTicketIdForRole3 = null;
  document.getElementById('role3-close-panel').classList.add('hidden');
  renderRole3TicketList();
}

export function setResolutionStatus(status) {
  state.selectedResolution = status;
  const btnF = document.getElementById('status-btn-finalizado');
  const btnE = document.getElementById('status-btn-espera');
  const waitBox = document.getElementById('wait-reason-box');
  if (status === 'FINALIZADO') {
    btnF.className = 'py-3 px-2.5 rounded-xl border-2 border-emeraldAgro bg-emerald-50 text-forest font-extrabold text-xs transition text-center';
    btnE.className = 'py-3 px-2.5 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-xs transition text-center';
    waitBox.classList.add('hidden');
  } else {
    btnF.className = 'py-3 px-2.5 rounded-xl border-2 border-stone-200 bg-creamSand text-stone-700 font-bold text-xs transition text-center';
    btnE.className = 'py-3 px-2.5 rounded-xl border-2 border-harvestGold bg-amber-50 text-barnTerra font-extrabold text-xs transition text-center';
    waitBox.classList.remove('hidden');
  }
}

export async function submitRepairClosure(syncFn) {
  const ticket = state.dbTickets.find(t => t.id_servicio === state.activeTicketIdForRole3);
  if (!ticket) return;

  const workText = document.getElementById('input-repair-work').value.trim();
  if (!workText) {
    showToast('Describe el trabajo realizado.', 'error');
    return;
  }

  const btn = document.getElementById('btn-save-repair');
  btn.disabled = true;
  btn.textContent = 'GUARDANDO REPARACIÓN...';

  const updatePayload = {
    trabajo_realizado: workText,
    estatus: state.selectedResolution,
    id_usuario_repara: state.currentUser.id_usuario,
    motivo_espera: state.selectedResolution === 'EN_ESPERA' ? document.getElementById('select-wait-reason').value : null,
    fecha_cierre: state.selectedResolution === 'FINALIZADO' ? new Date().toISOString() : null
  };

  try {
    await sbFetch(`servicios_mantenimiento?id_servicio=eq.${ticket.id_servicio}`, {
      method: 'PATCH',
      body: JSON.stringify(updatePayload)
    });

    for (const item of state.role3DraftFiles) {
      const publicUrl = await uploadImageToSupabaseStorage(item.fileObj, `srv_${ticket.id_servicio}_final`);
      await sbFetch('evidencias_servicio', {
        method: 'POST',
        body: JSON.stringify({
          id_servicio: ticket.id_servicio,
          etapa: 'REPARACION_FINAL',
          url_imagen: publicUrl,
          subido_por: state.currentUser.id_usuario
        })
      });
    }

    if (state.selectedResolution === 'FINALIZADO') {
      await sbFetch(`tractores?id_tractor=eq.${encodeURIComponent(ticket.id_tractor)}`, {
        method: 'PATCH',
        body: JSON.stringify({ estatus_operativo: 'ACTIVO' })
      });
    }

    if (syncFn) await syncFn(false);
    closeRole3Panel();
    showToast(`✔ Ticket #${ticket.id_servicio} actualizado a ${state.selectedResolution}.`, 'success');
  } catch (err) {
    handleAppError('Cierre de taller', err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'CONFIRMAR Y GUARDAR SERVICIO';
  }
}
