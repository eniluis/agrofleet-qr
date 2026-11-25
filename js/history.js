import {
  RANCH_NAMES,
  CATALOGO_ACTIVIDADES,
  ESPECIALIDADES_MNT,
  state,
} from "./config.js";
import { sbFetch, showToast, handleAppError } from "./api.js";

function getAreaMeta(code) {
  return ESPECIALIDADES_MNT[code] || ESPECIALIDADES_MNT.MECANICO;
}

function canTechnicianSeeTicket(ticket) {
  const user = state.currentUser;
  if (!user) return false;
  if (user.rol === "ADMIN") return true;

  const ticketArea = ticket.especialidad || "MECANICO";
  if (user.especialidades_asignadas) {
    const allowedAreas = user.especialidades_asignadas
      .split(",")
      .map((s) => s.trim().toUpperCase());
    if (!allowedAreas.includes(ticketArea.toUpperCase())) return false;
  }

  if (
    user.id_rancho &&
    ticket.id_rancho_reporte &&
    ticket.id_rancho_reporte !== user.id_rancho
  ) {
    return false;
  }

  return true;
}

function computeFuelEfficiencyData() {
  const byId = new Map();
  const byTractor = new Map();

  const sorted = [...(state.dbFuelLogs || [])].sort((a, b) => {
    const tA = a.fecha_hora ? new Date(a.fecha_hora).getTime() : 0;
    const tB = b.fecha_hora ? new Date(b.fecha_hora).getTime() : 0;
    if (tA !== tB) return tA - tB;
    return (Number(a.id_carga) || 0) - (Number(b.id_carga) || 0);
  });

  const tracker = new Map();

  for (const log of sorted) {
    const trId = log.id_tractor;
    if (!tracker.has(trId)) {
      tracker.set(trId, {
        lastHoro: null,
        pendingLiters: 0,
        totalMeasuredLiters: 0,
        totalHours: 0,
        intervals: [],
      });
    }

    const st = tracker.get(trId);
    const liters = parseFloat(log.litros) || 0;
    const horo =
      log.horometro !== null &&
      log.horometro !== "" &&
      !isNaN(parseFloat(log.horometro))
        ? parseFloat(log.horometro)
        : null;

    if (horo === null) {
      if (st.lastHoro !== null) {
        st.pendingLiters += liters;
      }
      continue;
    }

    if (st.lastHoro === null) {
      st.lastHoro = horo;
      st.pendingLiters = 0;
    } else {
      const deltaHours = Math.round((horo - st.lastHoro) * 100) / 100;
      const consumedLiters =
        Math.round((liters + st.pendingLiters) * 100) / 100;

      if (deltaHours > 0) {
        const lph = Math.round((consumedLiters / deltaHours) * 100) / 100;
        st.totalMeasuredLiters += consumedLiters;
        st.totalHours += deltaHours;
        st.intervals.push({
          id_carga: log.id_carga,
          deltaHours,
          consumedLiters,
          lph,
          actividad: log.actividad,
          fecha_hora: log.fecha_hora,
          rancho: log.id_rancho_carga,
        });
        if (log.id_carga !== undefined && log.id_carga !== null) {
          byId.set(log.id_carga, { deltaHours, consumedLiters, lph });
        }
      }

      st.lastHoro = horo;
      st.pendingLiters = 0;
    }
  }

  for (const [trId, st] of tracker.entries()) {
    const avgLph =
      st.totalHours > 0
        ? Math.round((st.totalMeasuredLiters / st.totalHours) * 100) / 100
        : null;
    const lastInterval =
      st.intervals.length > 0 ? st.intervals[st.intervals.length - 1] : null;
    byTractor.set(trId, {
      id_tractor: trId,
      totalMeasuredLiters: Math.round(st.totalMeasuredLiters * 10) / 10,
      totalHours: Math.round(st.totalHours * 10) / 10,
      avgLph,
      lastInterval,
      samples: st.intervals.length,
    });
  }

  return { byId, byTractor };
}

export function renderHistoryScreen() {
  if (!state.currentUser) return;
  const kpiGrid = document.getElementById("history-kpi-grid");
  const listEl = document.getElementById("history-records-list");
  const areaTag = document.getElementById("history-area-tag");
  const areaTitle = document.getElementById("history-area-title");
  const isAdmin = state.currentUser.rol === "ADMIN";
  const isMobileDiesel =
    state.currentUser.rol === "DIESEL" && !state.currentUser.id_rancho;

  let mode = "DIESEL";
  let ranchFilter = "TODOS";

  if (isAdmin) {
    mode = document.getElementById("filter-history-tab").value;
    ranchFilter = document.getElementById("filter-history-ranch").value;
  } else if (state.currentUser.rol === "DIESEL") {
    mode = "DIESEL";
    ranchFilter = state.currentUser.id_rancho || "TODOS";
  } else {
    mode = "MNT";
  }

  if (mode === "RENDIMIENTO" && isAdmin) {
    areaTag.textContent =
      ranchFilter === "TODOS"
        ? "Auditoría de Consumo · 4 Ranchos"
        : `Base: ${RANCH_NAMES[ranchFilter]}`;
    areaTitle.textContent = "Rendimiento por Tractor (L/h)";

    const { byTractor } = computeFuelEfficiencyData();
    let tractors = [...(state.dbTractors || [])];
    if (ranchFilter !== "TODOS") {
      tractors = tractors.filter((t) => t.id_rancho_base === ranchFilter);
    }

    const rows = tractors
      .map((t) => {
        const stats = byTractor.get(t.id_tractor) || {
          id_tractor: t.id_tractor,
          totalMeasuredLiters: 0,
          totalHours: 0,
          avgLph: null,
          lastInterval: null,
          samples: 0,
        };
        return { tractor: t, ...stats };
      })
      .sort((a, b) => (b.avgLph || -1) - (a.avgLph || -1));

    const measuredRows = rows.filter((r) => r.avgLph !== null);
    const totalHrs = measuredRows.reduce((acc, r) => acc + r.totalHours, 0);
    const totalLts = measuredRows.reduce(
      (acc, r) => acc + r.totalMeasuredLiters,
      0,
    );
    const globalAvg = totalHrs > 0 ? (totalLts / totalHrs).toFixed(2) : "0.00";

    kpiGrid.innerHTML = `
      <div class="bg-emerald-50 rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-forest">${globalAvg} L/h</span>
        <span class="text-[10px] font-semibold text-stone-600">Promedio Flotilla</span>
      </div>
      <div class="bg-amber-50 rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-harvestGold">${totalHrs.toFixed(1)} hrs</span>
        <span class="text-[10px] font-semibold text-stone-600">Horas Medidas</span>
      </div>
    `;

    if (rows.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-stone-500 text-center py-4">Sin tractores registrados para este filtro.</p>`;
      return;
    }

    listEl.innerHTML = rows
      .map((r) => {
        const t = r.tractor;
        const ranchLabel = RANCH_NAMES[t.id_rancho_base] || t.id_rancho_base;

        if (r.avgLph === null) {
          return `
          <div class="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-sm space-y-1 opacity-80">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-extrabold px-2 py-0.5 rounded bg-stone-600 text-white">#${t.id_tractor}</span>
                <span class="text-xs font-bold text-stone-800">${t.modelo}</span>
              </div>
              <span class="text-[11px] font-bold text-stone-400">Sin medición aún</span>
            </div>
            <p class="text-[11px] text-stone-500">Base: ${ranchLabel} · Requiere al menos 2 cargas con horómetro.</p>
          </div>
        `;
        }

        const lastLph = r.lastInterval ? r.lastInterval.lph : null;
        const isSpike =
          lastLph !== null && r.samples >= 2 && lastLph > r.avgLph * 1.35;

        return `
        <div class="bg-white rounded-2xl p-3.5 border ${isSpike ? "border-red-400" : "border-stone-200"} shadow-sm space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs font-extrabold px-2 py-0.5 rounded bg-forest text-white shrink-0">#${t.id_tractor}</span>
              <span class="text-xs font-bold text-stone-800 truncate">${t.modelo}</span>
            </div>
            <strong class="text-base font-black text-harvestGold shrink-0">${r.avgLph.toFixed(2)} L/h</strong>
          </div>
          <div class="grid grid-cols-3 gap-1.5 bg-creamSand rounded-xl p-2 text-center text-[11px]">
            <div>
              <span class="block text-[9px] font-bold uppercase text-stone-400">Horas Trab.</span>
              <strong class="text-stone-800 font-extrabold">${r.totalHours.toFixed(1)} h</strong>
            </div>
            <div>
              <span class="block text-[9px] font-bold uppercase text-stone-400">Diésel Medido</span>
              <strong class="text-stone-800 font-extrabold">${r.totalMeasuredLiters.toFixed(1)} L</strong>
            </div>
            <div>
              <span class="block text-[9px] font-bold uppercase text-stone-400">Último Tramo</span>
              <strong class="${isSpike ? "text-red-700" : "text-emeraldAgro"} font-extrabold">${lastLph !== null ? lastLph.toFixed(2) + " L/h" : "--"}</strong>
            </div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-stone-500">
            <span>Base: <strong>${ranchLabel}</strong> · ${r.samples} tramo${r.samples === 1 ? "" : "s"}</span>
            ${isSpike ? `<span class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-extrabold text-[10px]">⚠️ Consumo alto reciente</span>` : ""}
          </div>
        </div>
      `;
      })
      .join("");
    return;
  }

  if (mode === "DIESEL") {
    if (isMobileDiesel) {
      areaTag.textContent = `Mis Registros · ${state.currentUser.nombre}`;
      areaTitle.textContent = "Mis Cargas de Diésel";
    } else {
      areaTag.textContent =
        ranchFilter === "TODOS"
          ? "Consolidado 4 Ranchos"
          : `Bomba: ${RANCH_NAMES[ranchFilter]}`;
      areaTitle.textContent = "Bitácora de Cargas de Diésel";
    }

    let logs = state.dbFuelLogs;
    if (isMobileDiesel) {
      logs = logs.filter(
        (l) => l.id_usuario_diesel === state.currentUser.id_usuario,
      );
    } else if (ranchFilter !== "TODOS") {
      logs = logs.filter((l) => l.id_rancho_carga === ranchFilter);
    }

    const { byId } = computeFuelEfficiencyData();

    const totalL = logs.reduce((acc, x) => acc + parseFloat(x.litros || 0), 0);
    const crossCount = logs.filter((l) => {
      const tr = state.dbTractors.find((t) => t.id_tractor === l.id_tractor);
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

    listEl.innerHTML = logs
      .map((l) => {
        const tr = state.dbTractors.find((t) => t.id_tractor === l.id_tractor);
        const isCross = tr && tr.id_rancho_base !== l.id_rancho_carga;
        const dateStr = l.fecha_hora
          ? new Date(l.fecha_hora).toLocaleString("es-MX", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";
        const eff = byId.get(l.id_carga);

        const adminControls =
          isAdmin && l.id_carga !== "OFFLINE"
            ? `
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
      `
            : "";

        return `
        <div class="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-sm space-y-1">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-extrabold px-2 py-0.5 rounded bg-harvestGold text-white">#${l.id_tractor}</span>
              <span class="text-xs font-bold text-stone-800">${tr ? tr.modelo : ""}</span>
            </div>
            <strong class="text-base font-extrabold text-harvestGold">${parseFloat(l.litros).toFixed(1)} L</strong>
          </div>
          <p class="text-xs font-semibold text-forest">Actividad: ${l.actividad}</p>
          <div class="flex flex-wrap items-center justify-between gap-1 text-[11px] text-stone-500 pt-1 border-t border-stone-100">
            <span>Bomba: <strong>${RANCH_NAMES[l.id_rancho_carga] || l.id_rancho_carga}</strong> ${l.horometro ? "· Horóm: " + l.horometro : ""}</span>
            <span>${dateStr}</span>
          </div>
          ${eff ? `<span class="inline-block text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-50 text-forest border border-emerald-200">⚡ Rendimiento tramo: ${eff.lph.toFixed(2)} L/h (${eff.deltaHours} hrs)</span>` : ""}
          ${isCross ? `<span class="inline-block text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-barnTerra">🚜 Préstamo: Unidad base de ${RANCH_NAMES[tr.id_rancho_base]}</span>` : ""}
          ${adminControls}
        </div>
      `;
      })
      .join("");
  } else {
    areaTag.textContent =
      state.currentUser.rol === "TECNICO_MNT"
        ? `Mis Áreas · ${state.currentUser.nombre}`
        : "Control de Taller";
    areaTitle.textContent = "Historial de Mantenimientos";

    let tickets = state.dbTickets;
    if (state.currentUser.rol === "SOLICITANTE_MNT") {
      tickets = state.dbTickets.filter(
        (t) => t.id_usuario_solicita === state.currentUser.id_usuario,
      );
    } else if (state.currentUser.rol === "TECNICO_MNT") {
      tickets = state.dbTickets.filter((t) => canTechnicianSeeTicket(t));
    } else if (ranchFilter !== "TODOS") {
      tickets = state.dbTickets.filter(
        (t) => t.id_rancho_reporte === ranchFilter,
      );
    }

    const openC = tickets.filter((t) => t.estatus !== "FINALIZADO").length;
    const doneC = tickets.filter((t) => t.estatus === "FINALIZADO").length;

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

    if (tickets.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-stone-500 text-center py-4">Sin registros de mantenimiento para este filtro.</p>`;
      return;
    }

    listEl.innerHTML = tickets
      .map((t) => {
        const areaMeta = getAreaMeta(t.especialidad);
        const trObj = t.id_tractor
          ? (state.dbTractors || []).find(
              (tr) => tr.id_tractor === t.id_tractor,
            )
          : null;
        const sujeto = t.id_tractor
          ? `#${t.id_tractor}${trObj ? ` · ${trObj.modelo} (Serie:${trObj.serie || "S/N"})` : ""}`
          : t.ubicacion_zona || "Zona Fija";
        const ranchoLabel =
          RANCH_NAMES[t.id_rancho_reporte] || t.id_rancho_reporte || "";

        const adminMntControls = isAdmin
          ? `
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
      `
          : "";

        return `
        <div class="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-sm space-y-1.5">
          <div class="flex justify-between items-center gap-1.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="px-2 py-0.5 rounded bg-emerald-50 text-forest border border-emerald-200 font-extrabold text-[10px]">${areaMeta.shortLabel}</span>
              <strong class="text-xs text-forest">Ticket #${t.id_servicio} · ${sujeto}</strong>
            </div>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${t.estatus === "FINALIZADO" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-barnTerra"}">${t.estatus}</span>
          </div>
          <p class="text-xs text-stone-800">${t.descripcion_falla}</p>
          ${ranchoLabel ? `<p class="text-[11px] text-stone-500">Rancho: <strong>${ranchoLabel}</strong></p>` : ""}
          ${t.trabajo_realizado ? `<p class="text-xs text-emeraldAgro bg-emerald-50 p-2 rounded-lg"><strong>Solución:</strong> ${t.trabajo_realizado}</p>` : ""}
          ${adminMntControls}
        </div>
      `;
      })
      .join("");
  }
}

export function openAdminEditFuel(idCarga) {
  if (!state.currentUser || state.currentUser.rol !== "ADMIN") return;
  const log = state.dbFuelLogs.find((x) => x.id_carga === idCarga);
  if (!log) return;

  state.adminEditContext = { type: "DIESEL", id: idCarga };
  document.getElementById("admin-edit-title").textContent =
    `Editar Carga #${idCarga}`;
  document
    .getElementById("admin-edit-diesel-fields")
    .classList.remove("hidden");
  document.getElementById("admin-edit-mnt-fields").classList.add("hidden");

  const trcSel = document.getElementById("edit-fuel-tractor");
  trcSel.innerHTML = state.dbTractors
    .map(
      (t) =>
        `<option value="${t.id_tractor}">#${t.id_tractor} — ${t.modelo}</option>`,
    )
    .join("");
  trcSel.value = log.id_tractor;

  document.getElementById("edit-fuel-rancho").value = log.id_rancho_carga;
  document.getElementById("edit-fuel-liters").value = log.litros;
  document.getElementById("edit-fuel-horo").value = log.horometro || "";

  const actSel = document.getElementById("edit-fuel-activity");
  actSel.innerHTML = CATALOGO_ACTIVIDADES.map((item) => {
    const val = `[${item.id}] ${item.tarea} (${item.areaLabel})`;
    return `<option value="${val}">${val}</option>`;
  }).join("");

  if (!Array.from(actSel.options).some((o) => o.value === log.actividad)) {
    const opt = document.createElement("option");
    opt.value = log.actividad;
    opt.textContent = log.actividad;
    actSel.prepend(opt);
  }
  actSel.value = log.actividad;

  document.getElementById("modal-admin-edit").classList.remove("hidden");
}

export function openAdminEditMnt(idServicio) {
  if (!state.currentUser || state.currentUser.rol !== "ADMIN") return;
  const ticket = state.dbTickets.find((x) => x.id_servicio === idServicio);
  if (!ticket) return;

  state.adminEditContext = { type: "MNT", id: idServicio };
  document.getElementById("admin-edit-title").textContent =
    `Editar Ticket #${idServicio}`;
  document.getElementById("admin-edit-diesel-fields").classList.add("hidden");
  document.getElementById("admin-edit-mnt-fields").classList.remove("hidden");

  const trcSel = document.getElementById("edit-mnt-tractor");
  trcSel.innerHTML =
    `<option value="">-- Sin tractor (Zona Fija) --</option>` +
    state.dbTractors
      .map(
        (t) =>
          `<option value="${t.id_tractor}">#${t.id_tractor} — ${t.modelo}</option>`,
      )
      .join("");
  trcSel.value = ticket.id_tractor || "";

  document.getElementById("edit-mnt-rancho").value =
    ticket.id_rancho_reporte || "EDEN";
  document.getElementById("edit-mnt-prio").value = ticket.prioridad || "NORMAL";
  document.getElementById("edit-mnt-desc").value =
    ticket.descripcion_falla || "";
  document.getElementById("edit-mnt-work").value =
    ticket.trabajo_realizado || "";

  document.getElementById("modal-admin-edit").classList.remove("hidden");
}

export function closeAdminEditModal() {
  state.adminEditContext = null;
  document.getElementById("modal-admin-edit").classList.add("hidden");
}

export async function saveAdminRecordEdit(syncFn) {
  if (
    !state.currentUser ||
    state.currentUser.rol !== "ADMIN" ||
    !state.adminEditContext
  )
    return;
  const btn = document.getElementById("btn-admin-save-edit");
  btn.disabled = true;
  btn.textContent = "GUARDANDO...";

  try {
    if (state.adminEditContext.type === "DIESEL") {
      const litros = parseFloat(
        document.getElementById("edit-fuel-liters").value,
      );
      if (isNaN(litros) || litros <= 0) {
        showToast("Ingresa litros válidos.", "error");
        return;
      }
      const horo = parseFloat(document.getElementById("edit-fuel-horo").value);
      await sbFetch(`cargas_diesel?id_carga=eq.${state.adminEditContext.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          id_tractor: document.getElementById("edit-fuel-tractor").value,
          id_rancho_carga: document.getElementById("edit-fuel-rancho").value,
          litros,
          horometro: isNaN(horo) ? null : horo,
          actividad: document.getElementById("edit-fuel-activity").value,
        }),
      });
      showToast(
        `✔ Carga #${state.adminEditContext.id} actualizada por Admin.`,
        "success",
      );
    } else if (state.adminEditContext.type === "MNT") {
      const desc = document.getElementById("edit-mnt-desc").value.trim();
      if (!desc) {
        showToast("La descripción de la falla no puede quedar vacía.", "error");
        return;
      }
      const work = document.getElementById("edit-mnt-work").value.trim();
      const trcVal = document.getElementById("edit-mnt-tractor").value;
      await sbFetch(
        `servicios_mantenimiento?id_servicio=eq.${state.adminEditContext.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            id_tractor: trcVal || null,
            id_rancho_reporte: document.getElementById("edit-mnt-rancho").value,
            prioridad: document.getElementById("edit-mnt-prio").value,
            descripcion_falla: desc,
            trabajo_realizado: work || null,
          }),
        },
      );
      showToast(
        `✔ Ticket #${state.adminEditContext.id} actualizado por Admin.`,
        "success",
      );
    }

    closeAdminEditModal();
    if (syncFn) await syncFn(false);
  } catch (err) {
    handleAppError("Edición de registro", err);
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Guardar Cambios";
  }
}

export async function adminDeleteFuel(idCarga, syncFn) {
  if (!state.currentUser || state.currentUser.rol !== "ADMIN") return;
  if (
    !confirm(
      `¿Seguro que deseas eliminar permanentemente la carga #${idCarga}?`,
    )
  )
    return;
  try {
    await sbFetch(`cargas_diesel?id_carga=eq.${idCarga}`, { method: "DELETE" });
    if (syncFn) await syncFn(false);
    showToast(`🗑️ Carga #${idCarga} eliminada.`, "info");
  } catch (err) {
    handleAppError("Eliminación de carga", err);
  }
}

export async function adminDeleteMnt(idServicio, syncFn) {
  if (!state.currentUser || state.currentUser.rol !== "ADMIN") return;
  if (
    !confirm(
      `¿Seguro que deseas eliminar permanentemente el ticket #${idServicio}?`,
    )
  )
    return;
  try {
    await sbFetch(`servicios_mantenimiento?id_servicio=eq.${idServicio}`, {
      method: "DELETE",
    });
    if (syncFn) await syncFn(false);
    showToast(`🗑️ Ticket #${idServicio} eliminado.`, "info");
  } catch (err) {
    handleAppError("Eliminación de ticket", err);
  }
}

export function exportDataCSV() {
  const { byId } = computeFuelEfficiencyData();
  let csv =
    "ID_CARGA,TRACTOR,RANCHO_CARGA,LITROS,ACTIVIDAD,HOROMETRO,HORAS_TRABAJADAS,RENDIMIENTO_L_HR,USUARIO,FECHA\n";
  state.dbFuelLogs.forEach((l) => {
    const eff = byId.get(l.id_carga);
    const hrs = eff ? eff.deltaHours : "";
    const lph = eff ? eff.lph : "";
    csv += `${l.id_carga},${l.id_tractor},"${RANCH_NAMES[l.id_rancho_carga] || l.id_rancho_carga}",${l.litros},"${l.actividad}",${l.horometro || ""},${hrs},${lph},${l.id_usuario_diesel},${l.fecha_hora}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `AgroFleet_Reporte_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast("CSV descargado con cálculo de rendimiento.", "success");
}
