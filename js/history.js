import { RANCH_NAMES, CATALOGO_ACTIVIDADES, state } from './config.js';
import { sbFetch, showToast, handleAppError } from './api.js';

export function renderHistoryScreen() {
  if (!state.currentUser) return;
  const kpiGrid = document.getElementById('history-kpi-grid');
  const listEl = document.getElementById('history-records-list');
  const areaTag = document.getElementById('history-area-tag');
  const areaTitle = document.getElementById('history-area-title');
  const isAdmin = state.currentUser.rol === 'ADMIN';

  let mode = 'DIESEL';
  let ranchFilter = 'TODOS';

  if (isAdmin) {
    mode = document.getElementById('filter-history-tab').value;
    ranchFilter = document.getElementById('filter-history-ranch').value;
  } else if (state.currentUser.rol === 'DIESEL') {
    mode = 'DIESEL';
    ranchFilter = state.currentUser.id_rancho;
  } else {
    mode = 'MNT';
  }

  if (mode === 'DIESEL') {
    areaTag.textContent = ranchFilter === 'TODOS' ? 'Consolidado 4 Ranchos' : `Bomba: ${RANCH_NAMES[ranchFilter]}`;
    areaTitle.textContent = 'Bitácora de Cargas de Diésel';

    const logs = ranchFilter === 'TODOS'
      ? state.dbFuelLogs
      : state.dbFuelLogs.filter(l => l.id_rancho_carga === ranchFilter);

    const totalL = logs.reduce((acc, x) => acc + parseFloat(x.litros || 0), 0);
    const crossCount = logs.filter(l => {
      const tr = state.dbTractors.find(t => t.id_tractor === l.id_tractor);
      return tr && tr.id_rancho_base !== l.id_rancho_carga;
    }).length;

    kpiGrid.innerHTML = `
      <div class="bg-amber-50 rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-harvestGold">${totalL.toFixed(1)} L</span>
        <span class="text-[10px] font-semibold text-stone-600">Total Despachado</span>
      </div>
      <div class="bg-sandCard rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-barnTerra">${crossCount}</span>
        <span class="text-[10px] font-semibold text-stone-600">Cargas Cruzadas</span>
      </div>
    `;

    if (logs.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-stone-500 text-center py-4">Sin registros de diésel para este filtro.</p>`;
      return;
    }

    listEl.innerHTML = logs.map(l => {
      const tr = state.dbTractors.find(t => t.id_tractor === l.id_tractor);
      const isCross = tr && tr.id_rancho_base !== l.id_rancho_carga;
      const dateStr = l.fecha_hora ? new Date(l.fecha_hora).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '';

      const adminControls = (isAdmin && l.id_carga !== 'OFFLINE') ? `
        <div class="flex items-center justify-end gap-2 pt-2 mt-1.5 border-t border-stone-100">
          <button type="button" onclick="openAdminEditFuel(${l.id_carga})"
            class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-forest font-extrabold text-[11px] border border-emerald-200">
            ✏️ Editar
          </button>
          <button type="button" onclick="adminDeleteFuel(${l.id_carga})"
            class="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-[11px] border border-red-200">
            🗑️ Eliminar
          </button>
        </div>
      ` : '';

      return `
        <div class="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-sm space-y-1">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-extrabold px-2 py-0.5 rounded bg-harvestGold text-white">#${l.id_tractor}</span>
              <span class="text-xs font-bold text-stone-800">${tr ? tr.modelo : ''}</span>
            </div>
            <strong class="text-base font-extrabold text-harvestGold">${parseFloat(l.litros).toFixed(1)} L</strong>
          </div>
          <p class="text-xs font-semibold text-forest">Actividad: ${l.actividad}</p>
          <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] text-stone-500 pt-1 border-t border-stone-100">
            <span>Bomba: <strong>${RANCH_NAMES[l.id_rancho_carga] || l.id_rancho_carga}</strong> ${l.horometro ? '· Horóm: ' + l.horometro : ''}</span>
            <span>${dateStr}</span>
          </div>
          ${isCross ? `<span class="inline-block text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-barnTerra">🚜 Préstamo: Unidad base de ${RANCH_NAMES[tr.id_rancho_base]}</span>` : ''}
          ${adminControls}
        </div>
      `;
    }).join('');
  } else {
    areaTag.textContent = 'Control de Taller';
    areaTitle.textContent = 'Historial de Mantenimientos';

    let tickets = state.dbTickets;
    if (state.currentUser.rol === 'SOLICITANTE_MNT') {
      tickets = state.dbTickets.filter(t => t.id_usuario_solicita === state.currentUser.id_usuario);
    } else if (ranchFilter !== 'TODOS') {
      tickets = state.dbTickets.filter(t => t.id_rancho_reporte === ranchFilter);
    }

    const openC = tickets.filter(t => t.estatus !== 'FINALIZADO').length;
    const doneC = tickets.filter(t => t.estatus === 'FINALIZADO').length;

    kpiGrid.innerHTML = `
      <div class="bg-orange-50 rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-barnTerra">${openC}</span>
        <span class="text-[10px] font-semibold text-stone-600">Pendientes / Espera</span>
      </div>
      <div class="bg-emerald-50 rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-emeraldAgro">${doneC}</span>
        <span class="text-[10px] font-semibold text-stone-600">Finalizados</span>
      </div>
    `;

    listEl.innerHTML = tickets.map(t => {
      const adminMntControls = isAdmin ? `
        <div class="flex items-center justify-end gap-2 pt-2 mt-1.5 border-t border-stone-100">
          <button type="button" onclick="openAdminEditMnt(${t.id_servicio})"
            class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-forest font-extrabold text-[11px] border border-emerald-200">
            ✏️ Editar
          </button>
          <button type="button" onclick="adminDeleteMnt(${t.id_servicio})"
            class="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-[11px] border border-red-200">
            🗑️ Eliminar
          </button>
        </div>
      ` : '';

      return `
        <div class="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-sm space-y-1">
          <div class="flex justify-between items-center">
            <strong class="text-xs text-forest">Ticket #${t.id_servicio} · #${t.id_tractor}</strong>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full ${t.estatus === 'FINALIZADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-barnTerra'}">${t.estatus}</span>
          </div>
          <p class="text-xs text-stone-800">${t.descripcion_falla}</p>
          ${t.trabajo_realizado ? `<p class="text-xs text-emeraldAgro bg-emerald-50 p-2 rounded-lg"><strong>Solución:</strong> ${t.trabajo_realizado}</p>` : ''}
          ${adminMntControls}
        </div>
      `;
    }).join('');
  }
}

export function openAdminEditFuel(idCarga) {
  if (!state.currentUser || state.currentUser.rol !== 'ADMIN') return;
  const log = state.dbFuelLogs.find(x => x.id_carga === idCarga);
  if (!log) return;

  state.adminEditContext = { type: 'DIESEL', id: idCarga };
  document.getElementById('admin-edit-title').textContent = `Editar Carga #${idCarga}`;
  document.getElementById('admin-edit-diesel-fields').classList.remove('hidden');
  document.getElementById('admin-edit-mnt-fields').classList.add('hidden');

  const trcSel = document.getElementById('edit-fuel-tractor');
  trcSel.innerHTML = state.dbTractors.map(t => `<option value="${t.id_tractor}">#${t.id_tractor} — ${t.modelo}</option>`).join('');
  trcSel.value = log.id_tractor;

  document.getElementById('edit-fuel-rancho').value = log.id_rancho_carga;
  document.getElementById('edit-fuel-liters').value = log.litros;
  document.getElementById('edit-fuel-horo').value = log.horometro || '';

  const actSel = document.getElementById('edit-fuel-activity');
  actSel.innerHTML = CATALOGO_ACTIVIDADES.map(item => {
    const val = `[${item.id}] ${item.tarea} (${item.areaLabel})`;
    return `<option value="${val}">${val}</option>`;
  }).join('');

  if (!Array.from(actSel.options).some(o => o.value === log.actividad)) {
    const opt = document.createElement('option');
    opt.value = log.actividad;
    opt.textContent = log.actividad;
    actSel.prepend(opt);
  }
  actSel.value = log.actividad;

  document.getElementById('modal-admin-edit').classList.remove('hidden');
}

export function openAdminEditMnt(idServicio) {
  if (!state.currentUser || state.currentUser.rol !== 'ADMIN') return;
  const ticket = state.dbTickets.find(x => x.id_servicio === idServicio);
  if (!ticket) return;

  state.adminEditContext = { type: 'MNT', id: idServicio };
  document.getElementById('admin-edit-title').textContent = `Editar Ticket #${idServicio}`;
  document.getElementById('admin-edit-diesel-fields').classList.add('hidden');
  document.getElementById('admin-edit-mnt-fields').classList.remove('hidden');

  const trcSel = document.getElementById('edit-mnt-tractor');
  trcSel.innerHTML = state.dbTractors.map(t => `<option value="${t.id_tractor}">#${t.id_tractor} — ${t.modelo}</option>`).join('');
  trcSel.value = ticket.id_tractor;

  document.getElementById('edit-mnt-rancho').value = ticket.id_rancho_reporte || 'EDEN';
  document.getElementById('edit-mnt-prio').value = ticket.prioridad || 'NORMAL';
  document.getElementById('edit-mnt-desc').value = ticket.descripcion_falla || '';
  document.getElementById('edit-mnt-work').value = ticket.trabajo_realizado || '';

  document.getElementById('modal-admin-edit').classList.remove('hidden');
}

export function closeAdminEditModal() {
  state.adminEditContext = null;
  document.getElementById('modal-admin-edit').classList.add('hidden');
}

export async function saveAdminRecordEdit(syncFn) {
  if (!state.currentUser || state.currentUser.rol !== 'ADMIN' || !state.adminEditContext) return;
  const btn = document.getElementById('btn-admin-save-edit');
  btn.disabled = true;
  btn.textContent = 'GUARDANDO...';

  try {
    if (state.adminEditContext.type === 'DIESEL') {
      const litros = parseFloat(document.getElementById('edit-fuel-liters').value);
      if (isNaN(litros) || litros <= 0) {
        showToast('Ingresa litros válidos.', 'error');
        return;
      }
      const horo = parseFloat(document.getElementById('edit-fuel-horo').value);
      await sbFetch(`cargas_diesel?id_carga=eq.${state.adminEditContext.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          id_tractor: document.getElementById('edit-fuel-tractor').value,
          id_rancho_carga: document.getElementById('edit-fuel-rancho').value,
          litros,
          horometro: isNaN(horo) ? null : horo,
          actividad: document.getElementById('edit-fuel-activity').value
        })
      });
      showToast(`✔ Carga #${state.adminEditContext.id} actualizada por Admin.`, 'success');
    } else if (state.adminEditContext.type === 'MNT') {
      const desc = document.getElementById('edit-mnt-desc').value.trim();
      if (!desc) {
        showToast('La descripción de la falla no puede quedar vacía.', 'error');
        return;
      }
      const work = document.getElementById('edit-mnt-work').value.trim();
      await sbFetch(`servicios_mantenimiento?id_servicio=eq.${state.adminEditContext.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          id_tractor: document.getElementById('edit-mnt-tractor').value,
          id_rancho_reporte: document.getElementById('edit-mnt-rancho').value,
          prioridad: document.getElementById('edit-mnt-prio').value,
          descripcion_falla: desc,
          trabajo_realizado: work || null
        })
      });
      showToast(`✔ Ticket #${state.adminEditContext.id} actualizado por Admin.`, 'success');
    }

    closeAdminEditModal();
    if (syncFn) await syncFn(false);
  } catch (err) {
    handleAppError('Edición de registro', err);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar Cambios';
  }
}

export async function adminDeleteFuel(idCarga, syncFn) {
  if (!state.currentUser || state.currentUser.rol !== 'ADMIN') return;
  if (!confirm(`¿Seguro que deseas eliminar permanentemente la carga #${idCarga}?`)) return;
  try {
    await sbFetch(`cargas_diesel?id_carga=eq.${idCarga}`, { method: 'DELETE' });
    if (syncFn) await syncFn(false);
    showToast(`🗑️ Carga #${idCarga} eliminada.`, 'info');
  } catch (err) {
    handleAppError('Eliminación de carga', err);
  }
}

export async function adminDeleteMnt(idServicio, syncFn) {
  if (!state.currentUser || state.currentUser.rol !== 'ADMIN') return;
  if (!confirm(`¿Seguro que deseas eliminar permanentemente el ticket #${idServicio}?`)) return;
  try {
    await sbFetch(`servicios_mantenimiento?id_servicio=eq.${idServicio}`, { method: 'DELETE' });
    if (syncFn) await syncFn(false);
    showToast(`🗑️ Ticket #${idServicio} eliminado.`, 'info');
  } catch (err) {
    handleAppError('Eliminación de ticket', err);
  }
}

export function exportDataCSV() {
  let csv = 'ID_CARGA,TRACTOR,RANCHO_CARGA,LITROS,ACTIVIDAD,HOROMETRO,USUARIO,FECHA\n';
  state.dbFuelLogs.forEach(l => {
    csv += `${l.id_carga},${l.id_tractor},"${RANCH_NAMES[l.id_rancho_carga] || l.id_rancho_carga}",${l.litros},"${l.actividad}",${l.horometro || ''},${l.id_usuario_diesel},${l.fecha_hora}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `AgroFleet_Reporte_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast('CSV descargado.', 'success');
}
