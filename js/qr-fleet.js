import { RANCH_NAMES, state } from './config.js';
import { sbFetch, enqueueOfflineAction, showToast, handleAppError } from './api.js';
import { updateCrossRanchBanner, applySmartTractorContext } from './diesel.js';

let html5QrCodeInstance = null;
let cameraActive = false;
let editingTractorId = null;

export function renderQuickTractors() {
    const container = document.getElementById('quick-tractors-list');
    const warnBox = document.getElementById('no-tractors-warning');
    const card = document.getElementById('selected-tractor-card');
    const btnGoQR = document.getElementById('btn-go-register-qr');
    if (!container) return;

    if (state.dbTractors.length === 0) {
        container.innerHTML = `<span class="text-xs text-stone-400">Sin tractores registrados aún.</span>`;
        warnBox.classList.remove('hidden');
        card.classList.add('hidden');
        if (state.currentUser && (state.currentUser.rol === 'ADMIN' || state.currentUser.rol === 'DIESEL')) {
            btnGoQR.classList.remove('hidden');
        } else {
            btnGoQR.classList.add('hidden');
        }
        return;
    }

    warnBox.classList.add('hidden');
    if (!state.selectedTractorId || !state.dbTractors.some(t => t.id_tractor === state.selectedTractorId)) {
        state.selectedTractorId = state.dbTractors[0].id_tractor;
    }

    container.innerHTML = state.dbTractors.map(t => {
        const active = t.id_tractor === state.selectedTractorId;
        return `
      <button type="button" onclick="selectTractor('${t.id_tractor}')"
        class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${active ? 'bg-emeraldAgro text-white border border-emerald-300' : 'bg-white/10 hover:bg-white/20 text-stone-100'}">
        #${t.id_tractor}
      </button>
    `;
    }).join('');

    selectTractor(state.selectedTractorId, false);
}

function getLastServiceHorometer(tractorId, tagCode) {
    // Si se realizó un servicio mayor de 1000h, también reinicia los contadores de 500h y 300h
    const validTags = tagCode === '300' ? ['[PM-300H]', '[PM-1000H]'] :
        tagCode === '500' ? ['[PM-500H]', '[PM-1000H]'] : ['[PM-1000H]'];

    const ticket = state.dbTickets.find(t =>
        t.id_tractor === tractorId &&
        t.estatus === 'FINALIZADO' &&
        t.trabajo_realizado &&
        validTags.some(tag => t.trabajo_realizado.includes(tag))
    );

    if (!ticket) return null;

    const match = ticket.trabajo_realizado.match(/\[HORO:([\d.]+)\]/);
    if (match) return parseFloat(match[1]);

    const fuelAtTime = state.dbFuelLogs.find(l =>
        l.id_tractor === tractorId &&
        l.horometro !== null &&
        new Date(l.fecha_hora) <= new Date(ticket.fecha_cierre || ticket.fecha_solicitud)
    );
    return fuelAtTime ? parseFloat(fuelAtTime.horometro) : null;
}

export function renderPreventiveSemaphores(tractorId) {
    const box = document.getElementById('preventive-pm-box');
    const grid = document.getElementById('pm-badges-grid');
    const horoLabel = document.getElementById('pm-current-horo');
    if (!box || !grid) return;

    const logs = state.dbFuelLogs.filter(
        l => l.id_tractor === tractorId && l.horometro !== null && !isNaN(parseFloat(l.horometro))
    );

    if (logs.length === 0) {
        box.classList.add('hidden');
        return;
    }

    const currentHoro = parseFloat(logs[0].horometro);
    box.classList.remove('hidden');
    if (horoLabel) horoLabel.textContent = `Actual: ${currentHoro} hrs`;

    const rules = [
        { code: '300', label: 'Motor 300h', interval: 300, warn: 30 },
        { code: '500', label: 'Diésel/Aire 500h', interval: 500, warn: 40 },
        { code: '1000', label: 'Hidr/Sec 1000h', interval: 1000, warn: 50 }
    ];

    grid.innerHTML = rules.map(r => {
        const lastServiceHoro = getLastServiceHorometer(tractorId, r.code);
        let remaining;

        if (lastServiceHoro !== null) {
            const elapsed = currentHoro - lastServiceHoro;
            remaining = Math.round((r.interval - elapsed) * 10) / 10;
        } else {
            const nextDue = (Math.floor(currentHoro / r.interval) + 1) * r.interval;
            remaining = Math.round((nextDue - currentHoro) * 10) / 10;
        }

        let badgeClass = 'bg-emerald-50 border-emerald-200 text-emerald-900';
        let statusText = `Faltan ${remaining}h`;

        if (remaining <= 0) {
            badgeClass = 'bg-red-100 border-red-400 text-red-900 animate-pulse';
            statusText = `Vencido ${Math.abs(remaining)}h`;
        } else if (remaining <= r.warn) {
            badgeClass = 'bg-amber-100 border-amber-400 text-amber-950';
            statusText = `⚠️ En ${remaining}h`;
        }

        return `
      <div class="rounded-xl p-2 border ${badgeClass} text-center">
        <span class="block text-[10px] font-extrabold leading-tight">${r.label}</span>
        <strong class="block text-[11px] font-black mt-0.5">${statusText}</strong>
      </div>
    `;
    }).join('');
}

export function selectTractor(tractorId, reRenderButtons = true) {
    const tr = state.dbTractors.find(t => t.id_tractor.toUpperCase() === tractorId.toUpperCase());
    if (!tr) {
        showToast(`El QR "${tractorId}" no existe en el catálogo de tractores.`, 'error');
        return;
    }
    state.selectedTractorId = tr.id_tractor;
    if (reRenderButtons) renderQuickTractors();

    const card = document.getElementById('selected-tractor-card');
    if (card) card.classList.remove('hidden');

    document.getElementById('ui-tractor-id').textContent = `#${tr.id_tractor}`;
    document.getElementById('ui-tractor-model').textContent = tr.modelo;
    document.getElementById('ui-tractor-meta').textContent = `Serie: ${tr.serie || 'S/N'} · Tanque: ${tr.capacidad_tanque || '--'} L`;
    document.getElementById('ui-tractor-owner-rancho').textContent = RANCH_NAMES[tr.id_rancho_base] || tr.id_rancho_base;

    const statusEl = document.getElementById('ui-tractor-status');
    statusEl.textContent = tr.estatus_operativo;
    statusEl.className = tr.estatus_operativo === 'ACTIVO' ?
        'text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800' :
        'text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-barnTerra';

    updateCrossRanchBanner();
    applySmartTractorContext(tr.id_tractor);
    renderPreventiveSemaphores(tr.id_tractor);
}

export async function toggleRealCamera() {
    const realBox = document.getElementById('real-camera-box');
    const btn = document.getElementById('btn-toggle-camera');

    if (cameraActive) {
        await stopCameraIfRunning();
        return;
    }

    try {
        realBox.classList.remove('hidden');
        btn.textContent = '✕ Cerrar Cámara';
        html5QrCodeInstance = new Html5Qrcode('qr-reader');
        cameraActive = true;
        await html5QrCodeInstance.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 200, height: 200 } },
            (decodedText) => {
                const code = decodedText.trim().toUpperCase();
                selectTractor(code);
                showToast(`✔ QR escaneado: #${code}`, 'success');
                stopCameraIfRunning();
            }
        );
    } catch (e) {
        cameraActive = false;
        realBox.classList.add('hidden');
        btn.textContent = '📷 Abrir Cámara';
        showToast('No se pudo abrir la cámara. Verifica permisos HTTPS o usa la lista de tractores.', 'info');
    }
}

export async function stopCameraIfRunning() {
    if (html5QrCodeInstance && cameraActive) {
        try {
            await html5QrCodeInstance.stop();
            html5QrCodeInstance.clear();
        } catch (e) {}
    }
    cameraActive = false;
    const realBox = document.getElementById('real-camera-box');
    if (realBox) realBox.classList.add('hidden');
    const btn = document.getElementById('btn-toggle-camera');
    if (btn) btn.textContent = '📷 Abrir Cámara';
}

export async function handleCreateTractor(event, syncFn) {
    event.preventDefault();
    if (!state.currentUser) return;

    const idRanchoBase = document.getElementById('new-trc-rancho').value;
    const modelo = document.getElementById('new-trc-model').value.trim();
    const serie = document.getElementById('new-trc-serial').value.trim().toUpperCase();
    const cap = parseFloat(document.getElementById('new-trc-tank').value) || null;
    if (!modelo) return;

    const btn = document.getElementById('btn-create-tractor');
    btn.disabled = true;
    btn.textContent = 'GUARDANDO Y GENERANDO FOLIO...';

    const payload = {
        modelo,
        serie: serie || null,
        capacidad_tanque: cap,
        id_rancho_base: idRanchoBase,
        estatus_operativo: 'ACTIVO',
        creado_por: state.currentUser.id_usuario
    };

    try {
        let savedTractor = null;
        if (state.isOnline) {
            const inserted = await sbFetch('tractores', {
                method: 'POST',
                headers: { Prefer: 'return=representation' },
                body: JSON.stringify(payload)
            });
            savedTractor = inserted && inserted[0] ? inserted[0] : payload;
            if (syncFn) await syncFn(false);
        } else {
            const tempId = `TRC-TMP-${Date.now().toString().slice(-3)}`;
            savedTractor = {...payload, id_tractor: tempId };
            enqueueOfflineAction({ table: 'tractores', payload });
            state.dbTractors.unshift(savedTractor);
        }

        state.selectedTractorId = savedTractor.id_tractor;
        renderQRVisualCard(savedTractor);
        renderTractorsCatalog();

        document.getElementById('new-trc-model').value = '';
        document.getElementById('new-trc-serial').value = '';
        document.getElementById('new-trc-tank').value = '';

        showToast(`✔ Tractor #${savedTractor.id_tractor} guardado y etiqueta QR generada.`, 'success');
    } catch (err) {
        handleAppError('Alta de tractor', err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'GUARDAR TRACTOR Y GENERAR QR';
    }
}

export function renderQRVisualCard(tractor) {
    const wrapper = document.getElementById('generated-qr-wrapper');
    const box = document.getElementById('qrcode-canvas-box');
    wrapper.classList.remove('hidden');
    box.innerHTML = '';

    new QRCode(box, {
        text: tractor.id_tractor,
        width: 170,
        height: 170,
        colorDark: '#1B4332',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('qr-card-id').textContent = `#${tractor.id_tractor}`;
    document.getElementById('qr-card-model').textContent = tractor.modelo;
    document.getElementById('qr-card-rancho').textContent = `Rancho Base: ${RANCH_NAMES[tractor.id_rancho_base] || tractor.id_rancho_base}`;
    wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildQRLabelCanvas() {
    const qrCanvas = document.querySelector('#qrcode-canvas-box canvas');
    if (!qrCanvas) return null;

    const idText = document.getElementById('qr-card-id').textContent;
    const modelText = document.getElementById('qr-card-model').textContent;
    const ranchoText = document.getElementById('qr-card-rancho').textContent;

    const out = document.createElement('canvas');
    out.width = 420;
    out.height = 540;
    const ctx = out.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.strokeStyle = '#1B4332';
    ctx.lineWidth = 12;
    ctx.strokeRect(12, 12, out.width - 24, out.height - 24);

    ctx.fillStyle = '#2D6A4F';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AGROFLEET QR · MAQUINARIA', out.width / 2, 52);

    ctx.drawImage(qrCanvas, (out.width - 260) / 2, 74, 260, 260);

    ctx.fillStyle = '#1B4332';
    ctx.font = '900 42px Inter, sans-serif';
    ctx.fillText(idText, out.width / 2, 392);

    ctx.fillStyle = '#1F2937';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillText(modelText, out.width / 2, 432);

    ctx.fillStyle = '#C87D16';
    ctx.font = 'bold 19px Inter, sans-serif';
    ctx.fillText(ranchoText, out.width / 2, 472);

    return { canvas: out, idText };
}

export function downloadQRLabelPNG() {
    const built = buildQRLabelCanvas();
    if (!built) return;
    const link = document.createElement('a');
    link.download = `Etiqueta_QR_${built.idText.replace('#', '')}.png`;
    link.href = built.canvas.toDataURL('image/png');
    link.click();
    showToast('Etiqueta QR descargada en PNG.', 'success');
}

export function printQRInPWA() {
    setTimeout(() => window.print(), 150);
}

export async function shareQRLabelPWA() {
    const built = buildQRLabelCanvas();
    if (!built) return;

    built.canvas.toBlob(async(blob) => {
        if (!blob) return;
        const fileName = `Etiqueta_QR_${built.idText.replace('#', '')}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: `Etiqueta ${built.idText}`,
                    text: `Código QR AgroFleet ${built.idText}`,
                    files: [file]
                });
            } catch (e) {}
        } else {
            downloadQRLabelPNG();
            showToast('Tu dispositivo no soporta compartir directo; se descargó el PNG.', 'info');
        }
    }, 'image/png');
}

export function printTractorFromCatalog(tractor) {
    renderQRVisualCard(tractor);
    setTimeout(() => printQRInPWA(), 250);
}

export function renderTractorsCatalog() {
    const list = document.getElementById('tractors-catalog-list');
    const countEl = document.getElementById('tractors-total-count');
    if (!list) return;

    const isAdmin = state.currentUser && state.currentUser.rol === 'ADMIN';
    countEl.textContent = `${state.dbTractors.length} unidad${state.dbTractors.length === 1 ? '' : 'es'}`;

    if (state.dbTractors.length === 0) {
        list.innerHTML = `<p class="text-xs text-stone-500 text-center py-3">Registra arriba tu primer tractor para generar su QR.</p>`;
        return;
    }

    list.innerHTML = state.dbTractors.map(t => {
                const adminBtns = isAdmin ? `
      <div class="flex items-center justify-end gap-2 pt-2 mt-2 border-t border-stone-200/80">
        <button type="button" onclick="openAdminEditTractor('${t.id_tractor}')"
          class="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-forest font-extrabold text-[11px] border border-emerald-200">
          ✏️ Editar Unidad
        </button>
        <button type="button" onclick="adminDeleteTractor('${t.id_tractor}')"
          class="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-[11px] border border-red-200">
          🗑️ Eliminar
        </button>
      </div>
    ` : '';

                return `
      <div class="bg-creamSand rounded-xl p-2.5 border border-stone-200 text-xs">
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <strong class="text-forest font-extrabold">#${t.id_tractor}</strong>
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900">${RANCH_NAMES[t.id_rancho_base] || t.id_rancho_base}</span>
              ${t.estatus_operativo !== 'ACTIVO' ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-barnTerra">${t.estatus_operativo}</span>` : ''}
            </div>
            <span class="block text-stone-700 font-semibold mt-0.5">${t.modelo} ${t.serie ? '· ' + t.serie : ''} ${t.capacidad_tanque ? '· ' + t.capacidad_tanque + ' L' : ''}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" onclick='renderQRVisualCard(${JSON.stringify(t)})'
              class="px-2.5 py-1.5 rounded-lg bg-harvestGold text-white font-bold text-[11px]">
              Ver QR
            </button>
            <button type="button" onclick='printTractorFromCatalog(${JSON.stringify(t)})'
              class="px-2.5 py-1.5 rounded-lg bg-forest text-white font-bold text-[11px]">
              🖨️
            </button>
          </div>
        </div>
        ${adminBtns}
      </div>
    `;
  }).join('');
}

export function openAdminEditTractor(idTractor) {
  if (!state.currentUser || state.currentUser.rol !== 'ADMIN') return;
  const tr = state.dbTractors.find(t => t.id_tractor === idTractor);
  if (!tr) return;

  editingTractorId = idTractor;
  document.getElementById('admin-edit-trc-title').textContent = `Editar Tractor #${idTractor}`;
  document.getElementById('edit-trc-model').value = tr.modelo || '';
  document.getElementById('edit-trc-rancho').value = tr.id_rancho_base || 'EDEN';
  document.getElementById('edit-trc-status').value = tr.estatus_operativo || 'ACTIVO';
  document.getElementById('edit-trc-serial').value = tr.serie || '';
  document.getElementById('edit-trc-tank').value = tr.capacidad_tanque || '';

  document.getElementById('modal-admin-edit-tractor').classList.remove('hidden');
}

export function closeAdminEditTractorModal() {
  editingTractorId = null;
  document.getElementById('modal-admin-edit-tractor').classList.add('hidden');
}

export async function saveAdminTractorEdit(syncFn) {
  if (!state.currentUser || state.currentUser.rol !== 'ADMIN' || !editingTractorId) return;

  const modelo = document.getElementById('edit-trc-model').value.trim();
  if (!modelo) {
    showToast('El modelo del tractor no puede quedar vacío.', 'error');
    return;
  }

  const tankVal = parseFloat(document.getElementById('edit-trc-tank').value);
  const patchData = {
    modelo,
    id_rancho_base: document.getElementById('edit-trc-rancho').value,
    estatus_operativo: document.getElementById('edit-trc-status').value,
    serie: document.getElementById('edit-trc-serial').value.trim().toUpperCase() || null,
    capacidad_tanque: isNaN(tankVal) ? null : tankVal
  };

  const btn = document.getElementById('btn-admin-save-trc');
  btn.disabled = true;
  btn.textContent = 'GUARDANDO...';

  try {
    await sbFetch(`tractores?id_tractor=eq.${encodeURIComponent(editingTractorId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patchData)
    });

    const editedId = editingTractorId;
    closeAdminEditTractorModal();
    if (syncFn) await syncFn(false);
    showToast(`✔ Tractor #${editedId} actualizado correctamente.`, 'success');
  } catch (err) {
    handleAppError('Edición de tractor', err);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Guardar';
  }
}

export async function adminDeleteTractor(idTractor, syncFn) {
  if (!state.currentUser || state.currentUser.rol !== 'ADMIN') return;
  if (!confirm(`¿Seguro que deseas eliminar el tractor #${idTractor}? (Solo se podrá eliminar si no tiene cargas o reportes asociados).`)) return;

  try {
    await sbFetch(`tractores?id_tractor=eq.${encodeURIComponent(idTractor)}`, {
      method: 'DELETE'
    });
    if (state.selectedTractorId === idTractor) {
      state.selectedTractorId = null;
    }
    if (syncFn) await syncFn(false);
    showToast(`🗑️ Tractor #${idTractor} eliminado.`, 'info');
  } catch (err) {
    if (err.message && (err.message.includes('23503') || err.message.includes('foreign key'))) {
      showToast(`No se puede eliminar #${idTractor} porque ya tiene historial de diésel o mantenimiento. Cámbialo a estatus BAJA en Editar.`, 'error');
    } else {
      handleAppError('Eliminación de tractor', err);
    }
  }
}