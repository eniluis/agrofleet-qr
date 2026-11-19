import { RANCH_NAMES, CATALOGO_ACTIVIDADES, state } from './config.js';
import { sbFetch, enqueueOfflineAction, showToast, handleAppError } from './api.js';

export function updateCrossRanchBanner() {
  const alertBox = document.getElementById('cross-ranch-alert');
  const alertText = document.getElementById('cross-ranch-text');
  if (!alertBox) return;

  if (!state.currentUser || !state.selectedTractorId) {
    alertBox.classList.add('hidden');
    return;
  }
  const tr = state.dbTractors.find(t => t.id_tractor === state.selectedTractorId);
  if (!tr) return;

  const activeChargeRanch = state.currentUser.rol === 'ADMIN'
    ? document.getElementById('select-admin-charge-ranch').value
    : state.currentUser.id_rancho;

  if (activeChargeRanch && tr.id_rancho_base !== activeChargeRanch) {
    alertBox.classList.remove('hidden');
    alertText.textContent = `Unidad perteneciente a ${RANCH_NAMES[tr.id_rancho_base]} cargando diésel en bomba de ${RANCH_NAMES[activeChargeRanch]}.`;
  } else {
    alertBox.classList.add('hidden');
  }
}

export function setAreaFilter(areaCode) {
  state.selectedAreaFilter = areaCode;
  document.querySelectorAll('.area-chip').forEach(btn => {
    const active = btn.dataset.area === areaCode;
    btn.className = active
      ? 'area-chip shrink-0 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-forest text-white'
      : 'area-chip shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white text-stone-700 border border-stone-300';
  });
  renderFilteredActivities();
}

function normalizeText(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function renderFilteredActivities() {
  const sel = document.getElementById('select-activity');
  const searchInput = document.getElementById('input-activity-search');
  const hint = document.getElementById('activity-count-hint');
  if (!sel) return;

  const query = normalizeText(searchInput ? searchInput.value.trim() : '');
  const prevVal = sel.value;

  const filtered = CATALOGO_ACTIVIDADES.filter(item => {
    const matchArea = state.selectedAreaFilter === 'TODAS' || item.area === state.selectedAreaFilter;
    const fullText = normalizeText(`${item.id} ${item.tarea} ${item.areaLabel}`);
    const matchQuery = !query || fullText.includes(query);
    return matchArea && matchQuery;
  });

  if (hint) {
    hint.textContent = `${filtered.length} opción${filtered.length === 1 ? '' : 'es'}`;
  }

  let html = '';
  if (filtered.length === 0) {
    html = `<option value="">-- Sin coincidencias (usa Otra actividad) --</option>`;
  } else {
    if (filtered.length > 1) {
      html += `<option value="">-- Selecciona tarea (${filtered.length}) --</option>`;
    }
    html += filtered.map(item => {
      const val = `[${item.id}] ${item.tarea} (${item.areaLabel})`;
      const label = state.selectedAreaFilter === 'TODAS'
        ? `${item.tarea} · [${item.areaLabel}]`
        : `${item.tarea}`;
      return `<option value="${val}">${label}</option>`;
    }).join('');
  }

  html += `<option value="OTRO">✏️ Otra actividad (especificar manual)</option>`;
  sel.innerHTML = html;

  if (query && filtered.length === 1) {
    sel.selectedIndex = 0;
  } else if (prevVal && Array.from(sel.options).some(o => o.value === prevVal)) {
    sel.value = prevVal;
  }
  toggleCustomActivity();
}

export function setQuickLiters(val) {
  document.getElementById('input-liters').value = val;
}

export function toggleCustomActivity() {
  const sel = document.getElementById('select-activity').value;
  const customInput = document.getElementById('input-custom-activity');
  customInput.classList.toggle('hidden', sel !== 'OTRO');
}

export function openFuelConfirmModal() {
  if (!state.selectedTractorId) {
    showToast('Primero selecciona o escanea un tractor válido.', 'error');
    return;
  }

  const liters = parseFloat(document.getElementById('input-liters').value);
  if (isNaN(liters) || liters <= 0) {
    showToast('Ingresa los litros suministrados.', 'error');
    document.getElementById('input-liters').focus();
    return;
  }

  const actSelect = document.getElementById('select-activity').value;
  const customAct = document.getElementById('input-custom-activity').value.trim();
  const actividadFinal = actSelect === 'OTRO' ? customAct : actSelect;

  if (!actividadFinal) {
    showToast('Selecciona la actividad que está realizando el tractor.', 'error');
    document.getElementById('select-activity').focus();
    return;
  }

  const horoVal = parseFloat(document.getElementById('input-horometer').value);
  const ranchoCarga = state.currentUser.rol === 'ADMIN'
    ? document.getElementById('select-admin-charge-ranch').value
    : state.currentUser.id_rancho;

  state.pendingFuelDraftPayload = {
    id_tractor: state.selectedTractorId,
    id_rancho_carga: ranchoCarga,
    litros: liters,
    horometro: isNaN(horoVal) ? null : horoVal,
    actividad: actividadFinal,
    id_usuario_diesel: state.currentUser.id_usuario
  };

  const tr = state.dbTractors.find(t => t.id_tractor === state.selectedTractorId);
  document.getElementById('conf-fuel-tractor').textContent = `#${state.selectedTractorId} · ${tr ? tr.modelo : ''}`;
  document.getElementById('conf-fuel-rancho').textContent = RANCH_NAMES[ranchoCarga] || ranchoCarga;
  document.getElementById('conf-fuel-liters').textContent = `${liters.toFixed(1)} L`;
  document.getElementById('conf-fuel-activity').textContent = actividadFinal;
  document.getElementById('conf-fuel-horo').textContent = isNaN(horoVal) ? 'No registrado' : `${horoVal} hrs`;

  const crossWarn = document.getElementById('conf-fuel-cross-warn');
  if (tr && tr.id_rancho_base !== ranchoCarga) {
    crossWarn.textContent = `⚠️ Préstamo cruzado: Esta unidad es de ${RANCH_NAMES[tr.id_rancho_base]} y cargará en ${RANCH_NAMES[ranchoCarga]}.`;
    crossWarn.classList.remove('hidden');
  } else {
    crossWarn.classList.add('hidden');
  }

  document.getElementById('modal-confirm-fuel').classList.remove('hidden');
}

export function closeFuelConfirmModal() {
  document.getElementById('modal-confirm-fuel').classList.add('hidden');
}

export async function confirmAndSaveFuelLoad(syncFn) {
  if (!state.pendingFuelDraftPayload) return;
  const payload = state.pendingFuelDraftPayload;

  const btn = document.getElementById('btn-confirm-fuel-final');
  btn.disabled = true;
  btn.textContent = 'GUARDANDO...';

  try {
    if (state.isOnline) {
      await sbFetch('cargas_diesel', { method: 'POST', body: JSON.stringify(payload) });
      if (syncFn) await syncFn(false);
      showToast(`✔ Carga de ${payload.litros} L en #${payload.id_tractor} (${RANCH_NAMES[payload.id_rancho_carga]}) guardada.`, 'success');
    } else {
      enqueueOfflineAction({ table: 'cargas_diesel', payload });
      state.dbFuelLogs.unshift({ ...payload, id_carga: 'OFFLINE', fecha_hora: new Date().toISOString() });
      showToast('⏳ Sin señal: carga guardada en cola local para sincronizar.', 'info');
    }

    closeFuelConfirmModal();
    state.pendingFuelDraftPayload = null;
    document.getElementById('input-liters').value = '';
    document.getElementById('input-horometer').value = '';
    document.getElementById('input-activity-search').value = '';
    setAreaFilter('TODAS');
    document.getElementById('input-custom-activity').value = '';
    document.getElementById('input-custom-activity').classList.add('hidden');
  } catch (err) {
    handleAppError('Registro de diésel', err);
  } finally {
    btn.disabled = false;
    btn.textContent = '✔ Sí, Guardar';
  }
}
