import {
  RANCH_NAMES,
  CATALOGO_ACTIVIDADES,
  ESPECIALIDADES_MNT,
  state,
} from "./config.js";
import { sbFetch, showToast, handleAppError } from "./api.js";

const HISTORY_PAGE_SIZE = 7;
let historyVisibleLimit = HISTORY_PAGE_SIZE;
let customRangeFuelLogs = null;
let customRangeTickets = null;

function toLocalYMD(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeSearchText(str) {
  return (str || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .toLowerCase()
    .trim();
}

function getMatchingTractorIds(rawQuery) {
  const clean = normalizeSearchText(rawQuery);
  if (!clean) return null; // null = sin filtro de unidad (todas)

  const words = clean.split(/\s+/).filter(Boolean);
  const matches = new Set();

  (state.dbTractors || []).forEach((t) => {
    const searchable = normalizeSearchText(
      `${t.id_tractor} ${t.modelo} ${t.serie || ""}`,
    );
    if (words.every((w) => searchable.includes(w))) {
      matches.add(t.id_tractor);
    }
  });

  // También permitir coincidencia directa por ID aunque no esté cargado en dbTractors
  if (matches.size === 0 && clean.startsWith("trc ")) {
    matches.add(clean.replace(/\s+/g, "-").toUpperCase());
  }

  return matches;
}

function resolveSingleTractorFromQuery(rawQuery, matchingSet) {
  const clean = normalizeSearchText(rawQuery);
  if (!clean || !matchingSet) return null;

  // Si coincide exactamente con un ID (ej. "trc 015" o "trc-015")
  const exactById = (state.dbTractors || []).find(
    (t) => normalizeSearchText(t.id_tractor) === clean,
  );
  if (exactById) return exactById;

  // Si la búsqueda reduce el resultado a 1 solo tractor
  if (matchingSet.size === 1) {
    const onlyId = Array.from(matchingSet)[0];
    return (
      (state.dbTractors || []).find((t) => t.id_tractor === onlyId) || null
    );
  }

  return null;
}

export function clearHistoryTractorFilter() {
  const input = document.getElementById("filter-history-tractor");
  if (input) {
    input.value = "";
    input.focus();
  }
  onHistoryFilterChange();
}

function updateQuickRangeButtonsUI(activePreset) {
  const map = {
    HOY: "Hoy",
    SEMANA: "Semana",
    MES: "Este Mes",
    TODOS: "Recientes",
  };
  document
    .querySelectorAll('button[onclick^="setHistoryQuickRange"]')
    .forEach((btn) => {
      const isMatch = btn.textContent.trim() === map[activePreset];
      btn.className = isMatch
        ? "px-2 py-0.5 rounded-md bg-forest text-white text-[10px] font-bold transition"
        : "px-2 py-0.5 rounded-md bg-sandCard hover:bg-emerald-100 text-[10px] font-bold text-stone-700 border border-stone-300 transition";
    });
}

export async function setHistoryQuickRange(preset) {
  const fromEl = document.getElementById("filter-history-from");
  const toEl = document.getElementById("filter-history-to");
  if (!fromEl || !toEl) return;

  updateQuickRangeButtonsUI(preset);
  const now = new Date();

  if (preset === "TODOS") {
    fromEl.value = "";
    toEl.value = "";
    customRangeFuelLogs = null;
    customRangeTickets = null;
    historyVisibleLimit = HISTORY_PAGE_SIZE;
    renderHistoryScreen();
    return;
  }

  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "SEMANA") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  } else if (preset === "MES") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  fromEl.value = toLocalYMD(start);
  toEl.value = toLocalYMD(now);
  await onHistoryDateChange(false);
}

export async function onHistoryDateChange(clearPresetHighlight = true) {
  if (clearPresetHighlight) updateQuickRangeButtonsUI(null);
  historyVisibleLimit = HISTORY_PAGE_SIZE;

  const fromEl = document.getElementById("filter-history-from");
  const toEl = document.getElementById("filter-history-to");
  const fromVal = fromEl ? fromEl.value : "";
  const toVal = toEl ? toEl.value : "";

  if (!fromVal && !toVal) {
    updateQuickRangeButtonsUI("TODOS");
    customRangeFuelLogs = null;
    customRangeTickets = null;
    renderHistoryScreen();
    return;
  }

  if (!state.isOnline) {
    showToast(
      "Sin conexión: filtrando sobre los registros guardados en el dispositivo.",
      "info",
    );
    customRangeFuelLogs = null;
    customRangeTickets = null;
    renderHistoryScreen();
    return;
  }

  const listEl = document.getElementById("history-records-list");
  if (listEl) {
    listEl.innerHTML = `<p class="text-xs font-bold text-forest text-center py-6 animate-pulse">⏳ Consultando historial en Supabase...</p>`;
  }

  try {
    const fuelFilters = ["order=fecha_hora.desc", "limit=1000"];
    const ticketFilters = ["order=fecha_solicitud.desc", "limit=1000"];

    if (fromVal) {
      const startIso = new Date(`${fromVal}T00:00:00`).toISOString();
      fuelFilters.push(`fecha_hora=gte.${encodeURIComponent(startIso)}`);
      ticketFilters.push(`fecha_solicitud=gte.${encodeURIComponent(startIso)}`);
    }
    if (toVal) {
      const endIso = new Date(`${toVal}T23:59:59.999`).toISOString();
      fuelFilters.push(`fecha_hora=lte.${encodeURIComponent(endIso)}`);
      ticketFilters.push(`fecha_solicitud=lte.${encodeURIComponent(endIso)}`);
    }

    const [fuels, tickets] = await Promise.all([
      sbFetch(`cargas_diesel?${fuelFilters.join("&")}`),
      sbFetch(`servicios_mantenimiento?${ticketFilters.join("&")}`),
    ]);

    customRangeFuelLogs = fuels || [];
    customRangeTickets = tickets || [];
    renderHistoryScreen();
  } catch (err) {
    handleAppError("Consulta por fecha", err);
    customRangeFuelLogs = null;
    customRangeTickets = null;
    renderHistoryScreen();
  }
}

export function onHistoryFilterChange() {
  historyVisibleLimit = HISTORY_PAGE_SIZE;
  renderHistoryScreen();
}

export function loadMoreHistoryRecords() {
  historyVisibleLimit += HISTORY_PAGE_SIZE;
  renderHistoryScreen();
}

export function showAllHistoryRecords() {
  historyVisibleLimit = 99999;
  renderHistoryScreen();
}

export function resetHistoryPagination() {
  historyVisibleLimit = HISTORY_PAGE_SIZE;
  renderHistoryScreen();
}

function matchesDateRangeLocal(dateStr, fromVal, toVal) {
  if (!fromVal && !toVal) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;

  if (fromVal) {
    const start = new Date(`${fromVal}T00:00:00`);
    if (d < start) return false;
  }
  if (toVal) {
    const end = new Date(`${toVal}T23:59:59.999`);
    if (d > end) return false;
  }
  return true;
}

function getActiveDateRange() {
  const fromEl = document.getElementById("filter-history-from");
  const toEl = document.getElementById("filter-history-to");
  const fromVal = fromEl ? fromEl.value : "";
  const toVal = toEl ? toEl.value : "";
  return { fromVal, toVal, hasRange: Boolean(fromVal || toVal) };
}

function renderPaginationControls(totalCount, shownCount, itemLabel) {
  if (totalCount <= HISTORY_PAGE_SIZE) return "";

  if (shownCount < totalCount) {
    const remaining = totalCount - shownCount;
    const nextBatch = Math.min(HISTORY_PAGE_SIZE, remaining);
    return `
      <div class="bg-white rounded-2xl p-3 border border-stone-200 shadow-sm text-center space-y-2">
        <p class="text-[11px] font-semibold text-stone-500">
          Mostrando <strong>${shownCount}</strong> de <strong>${totalCount}</strong> ${itemLabel}
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" onclick="loadMoreHistoryRecords()"
            class="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-forest font-extrabold text-xs border border-emerald-200 transition">
            + Ver ${nextBatch} más
          </button>
          <button type="button" onclick="showAllHistoryRecords()"
            class="py-2 px-3 rounded-xl bg-sandCard hover:bg-stone-200 text-stone-700 font-bold text-xs border border-stone-300 transition">
            Ver todas (${totalCount})
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="text-center pt-1">
      <button type="button" onclick="resetHistoryPagination()"
        class="px-3.5 py-1.5 rounded-xl bg-sandCard hover:bg-stone-200 text-stone-700 font-bold text-[11px] border border-stone-300 transition">
        ▲ Mostrar solo las últimas ${HISTORY_PAGE_SIZE}
      </button>
    </div>
  `;
}

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

function computeFuelEfficiencyData(sourceLogs) {
  const byId = new Map();
  const byTractor = new Map();

  const sorted = [...(sourceLogs || [])].sort((a, b) => {
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
          horoInicio: st.lastHoro,
          horoFin: horo,
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
      intervals: [...st.intervals].reverse(),
      samples: st.intervals.length,
    });
  }

  return { byId, byTractor };
}

function getFilteredDieselLogs() {
  const isAdmin = state.currentUser && state.currentUser.rol === "ADMIN";
  const isMobileDiesel =
    state.currentUser &&
    state.currentUser.rol === "DIESEL" &&
    !state.currentUser.id_rancho;

  const { fromVal, toVal, hasRange } = getActiveDateRange();
  const baseSource =
    hasRange && customRangeFuelLogs !== null
      ? customRangeFuelLogs
      : state.dbFuelLogs || [];

  let ranchFilter = "TODOS";
  if (isAdmin) {
    const rSel = document.getElementById("filter-history-ranch");
    ranchFilter = rSel ? rSel.value : "TODOS";
  } else if (state.currentUser && state.currentUser.rol === "DIESEL") {
    ranchFilter = state.currentUser.id_rancho || "TODOS";
  }

  const trcInput = document.getElementById("filter-history-tractor");
  const tractorQuery = trcInput ? trcInput.value.trim() : "";
  const matchingIds = getMatchingTractorIds(tractorQuery);

  let logs = baseSource;
  if (isMobileDiesel) {
    logs = logs.filter(
      (l) => l.id_usuario_diesel === state.currentUser.id_usuario,
    );
  } else if (ranchFilter !== "TODOS") {
    logs = logs.filter((l) => l.id_rancho_carga === ranchFilter);
  }

  if (matchingIds !== null) {
    logs = logs.filter((l) => matchingIds.has(l.id_tractor));
  }

  if (hasRange) {
    logs = logs.filter((l) =>
      matchesDateRangeLocal(l.fecha_hora, fromVal, toVal),
    );
  }

  return {
    logs,
    baseSource,
    ranchFilter,
    tractorQuery,
    matchingIds,
    fromVal,
    toVal,
    isMobileDiesel,
  };
}

export function renderHistoryScreen() {
  if (!state.currentUser) return;

  const kpiGrid = document.getElementById("history-kpi-grid");
  const listEl = document.getElementById("history-records-list");
  const areaTag = document.getElementById("history-area-tag");
  const areaTitle = document.getElementById("history-area-title");
  if (!kpiGrid || !listEl) return;

  const isAdmin = state.currentUser.rol === "ADMIN";
  const { fromVal, toVal, hasRange } = getActiveDateRange();

  const trcInput = document.getElementById("filter-history-tractor");
  const clearTrcBtn = document.getElementById("btn-clear-history-tractor");
  const tractorQuery = trcInput ? trcInput.value.trim() : "";
  if (clearTrcBtn) {
    clearTrcBtn.classList.toggle("hidden", tractorQuery.length === 0);
  }
  const matchingIds = getMatchingTractorIds(tractorQuery);

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

  // ==================== VISTA RENDIMIENTO (L/h) ====================
  if (mode === "RENDIMIENTO" && isAdmin) {
    const sourceLogs =
      hasRange && customRangeFuelLogs !== null
        ? customRangeFuelLogs
        : state.dbFuelLogs || [];
    const { byTractor } = computeFuelEfficiencyData(sourceLogs);

    const singleTractor = resolveSingleTractorFromQuery(
      tractorQuery,
      matchingIds,
    );

    // MODO AUDITORÍA DETALLADA DE UN SOLO TRACTOR
    if (singleTractor) {
      const stats = byTractor.get(singleTractor.id_tractor) || {
        totalMeasuredLiters: 0,
        totalHours: 0,
        avgLph: null,
        intervals: [],
        samples: 0,
      };
      const allLogsTractor = sourceLogs.filter(
        (l) => l.id_tractor === singleTractor.id_tractor,
      );
      const totalDespachado = allLogsTractor.reduce(
        (acc, x) => acc + parseFloat(x.litros || 0),
        0,
      );

      areaTag.textContent = `Base: ${RANCH_NAMES[singleTractor.id_rancho_base] || singleTractor.id_rancho_base}`;
      areaTitle.textContent = `#${singleTractor.id_tractor} · ${singleTractor.modelo}`;

      kpiGrid.innerHTML = `
        <div class="bg-emerald-50 rounded-xl p-2.5">
          <span class="block text-base font-extrabold text-forest">${stats.avgLph !== null ? stats.avgLph.toFixed(2) + " L/h" : "-- L/h"}</span>
          <span class="text-[10px] font-semibold text-stone-600">Promedio (${stats.totalHours.toFixed(1)} hrs)</span>
        </div>
        <div class="bg-amber-50 rounded-xl p-2.5">
          <span class="block text-base font-extrabold text-harvestGold">${totalDespachado.toFixed(1)} L</span>
          <span class="text-[10px] font-semibold text-stone-600">Total Cargado (${allLogsTractor.length})</span>
        </div>
      `;

      if (stats.intervals.length === 0) {
        listEl.innerHTML = `
          <div class="bg-white rounded-2xl p-4 border border-stone-200 text-center space-y-1">
            <p class="text-xs font-bold text-stone-700">Sin tramos medidos en este rango de fechas</p>
            <p class="text-[11px] text-stone-500">Se necesitan al menos 2 cargas con horómetro capturado dentro del periodo para calcular los L/h.</p>
          </div>
        `;
        return;
      }

      const visibleIntervals = stats.intervals.slice(0, historyVisibleLimit);

      listEl.innerHTML =
        visibleIntervals
          .map((iv) => {
            const dateStr = iv.fecha_hora
              ? new Date(iv.fecha_hora).toLocaleString("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "";
            const isSpike =
              stats.avgLph &&
              stats.samples >= 2 &&
              iv.lph > stats.avgLph * 1.35;

            return `
          <div class="bg-white rounded-2xl p-3.5 border ${isSpike ? "border-red-400" : "border-stone-200"} shadow-sm space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[11px] font-extrabold px-2 py-0.5 rounded bg-forest text-white">
                ${iv.horoInicio} → ${iv.horoFin} hrs (+${iv.deltaHours} h)
              </span>
              <strong class="text-base font-black ${isSpike ? "text-red-700" : "text-harvestGold"}">
                ${iv.lph.toFixed(2)} L/h
              </strong>
            </div>
            <p class="text-xs font-semibold text-stone-800">Actividad: ${iv.actividad || "No especificada"}</p>
            <div class="flex items-center justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100">
              <span>Consumo tramo: <strong>${iv.consumedLiters.toFixed(1)} L</strong> · ${RANCH_NAMES[iv.rancho] || iv.rancho}</span>
              <span>${dateStr}</span>
            </div>
            ${isSpike ? `<span class="inline-block text-[10px] font-extrabold px-2 py-0.5 rounded bg-red-100 text-red-800">⚠️ Consumo alto (+35% sobre su promedio)</span>` : ""}
          </div>
        `;
          })
          .join("") +
        renderPaginationControls(
          stats.intervals.length,
          visibleIntervals.length,
          "tramos medidos",
        );
      return;
    }

    // MODO COMPARATIVO (TODAS O COINCIDENCIAS PARCIALES COMO "5415")
    areaTag.textContent =
      ranchFilter === "TODOS"
        ? "Auditoría de Consumo · 4 Ranchos"
        : `Base: ${RANCH_NAMES[ranchFilter]}`;
    areaTitle.textContent = tractorQuery
      ? `Rendimiento: "${tractorQuery}"`
      : "Rendimiento por Tractor (L/h)";

    let tractors = [...(state.dbTractors || [])];
    if (ranchFilter !== "TODOS") {
      tractors = tractors.filter((t) => t.id_rancho_base === ranchFilter);
    }
    if (matchingIds !== null) {
      tractors = tractors.filter((t) => matchingIds.has(t.id_tractor));
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
        <span class="text-[10px] font-semibold text-stone-600">Promedio (${measuredRows.length} medidos)</span>
      </div>
      <div class="bg-amber-50 rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-harvestGold">${totalHrs.toFixed(1)} hrs</span>
        <span class="text-[10px] font-semibold text-stone-600">Horas Medidas</span>
      </div>
    `;

    if (rows.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-stone-500 text-center py-4">Sin unidades que coincidan con "${tractorQuery}".</p>`;
      return;
    }

    const visibleRows = rows.slice(0, historyVisibleLimit);

    listEl.innerHTML =
      visibleRows
        .map((r) => {
          const t = r.tractor;
          const ranchLabel = RANCH_NAMES[t.id_rancho_base] || t.id_rancho_base;

          if (r.avgLph === null) {
            return `
          <div onclick="inspectSingleTractorEfficiency('${t.id_tractor}')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-stone-200 shadow-sm space-y-1 opacity-80">
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
        <div onclick="inspectSingleTractorEfficiency('${t.id_tractor}')" class="cursor-pointer hover:border-forest transition bg-white rounded-2xl p-3.5 border ${isSpike ? "border-red-400" : "border-stone-200"} shadow-sm space-y-1.5">
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
            <span>Base: <strong>${ranchLabel}</strong> · ${r.samples} tramo${r.samples === 1 ? "" : "s"} (toca para desglose)</span>
            ${isSpike ? `<span class="px-2 py-0.5 rounded bg-red-100 text-red-800 font-extrabold text-[10px]">⚠️ Consumo alto</span>` : ""}
          </div>
        </div>
      `;
        })
        .join("") +
      renderPaginationControls(rows.length, visibleRows.length, "unidades");
    return;
  }

  // ==================== VISTA CARGAS DE DIÉSEL ====================
  if (mode === "DIESEL") {
    const { logs, baseSource, isMobileDiesel } = getFilteredDieselLogs();

    if (isMobileDiesel) {
      areaTag.textContent = `Mis Registros · ${state.currentUser.nombre}`;
      areaTitle.textContent = "Mis Cargas de Diésel";
    } else {
      areaTag.textContent =
        ranchFilter === "TODOS"
          ? "Consolidado 4 Ranchos"
          : `Bomba: ${RANCH_NAMES[ranchFilter]}`;
      areaTitle.textContent = tractorQuery
        ? `Cargas: "${tractorQuery}"`
        : "Bitácora de Cargas de Diésel";
    }

    const { byId } = computeFuelEfficiencyData(baseSource);

    const totalL = logs.reduce((acc, x) => acc + parseFloat(x.litros || 0), 0);
    const crossCount = logs.filter((l) => {
      const tr = state.dbTractors.find((t) => t.id_tractor === l.id_tractor);
      return tr && tr.id_rancho_base !== l.id_rancho_carga;
    }).length;

    kpiGrid.innerHTML = `
      <div class="bg-amber-50 rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-harvestGold">${totalL.toFixed(1)} L</span>
        <span class="text-[10px] font-semibold text-stone-600">Total Despachado (${logs.length})</span>
      </div>
      <div class="bg-sandCard rounded-xl p-2.5">
        <span class="block text-base font-extrabold text-barnTerra">${crossCount}</span>
        <span class="text-[10px] font-semibold text-stone-600">Cargas Cruzadas</span>
      </div>
    `;

    if (logs.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-stone-500 text-center py-4">Sin registros de diésel para los filtros seleccionados.</p>`;
      return;
    }

    const visibleLogs = logs.slice(0, historyVisibleLimit);

    listEl.innerHTML =
      visibleLogs
        .map((l) => {
          const tr = state.dbTractors.find(
            (t) => t.id_tractor === l.id_tractor,
          );
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
        .join("") +
      renderPaginationControls(logs.length, visibleLogs.length, "cargas");
  } else {
    // ==================== VISTA MANTENIMIENTOS ====================
    areaTag.textContent =
      state.currentUser.rol === "TECNICO_MNT"
        ? `Mis Áreas · ${state.currentUser.nombre}`
        : "Control de Taller";
    areaTitle.textContent = "Historial de Mantenimientos";

    let tickets =
      hasRange && customRangeTickets !== null
        ? customRangeTickets
        : state.dbTickets || [];

    if (state.currentUser.rol === "SOLICITANTE_MNT") {
      tickets = tickets.filter(
        (t) => t.id_usuario_solicita === state.currentUser.id_usuario,
      );
    } else if (state.currentUser.rol === "TECNICO_MNT") {
      tickets = tickets.filter((t) => canTechnicianSeeTicket(t));
    } else if (ranchFilter !== "TODOS") {
      tickets = tickets.filter((t) => t.id_rancho_reporte === ranchFilter);
    }

    if (matchingIds !== null) {
      tickets = tickets.filter(
        (t) => t.id_tractor && matchingIds.has(t.id_tractor),
      );
    }

    if (hasRange) {
      tickets = tickets.filter((t) =>
        matchesDateRangeLocal(t.fecha_solicitud, fromVal, toVal),
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
      listEl.innerHTML = `<p class="text-xs text-stone-500 text-center py-4">Sin registros de mantenimiento para los filtros seleccionados.</p>`;
      return;
    }

    const visibleTickets = tickets.slice(0, historyVisibleLimit);

    listEl.innerHTML =
      visibleTickets
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
        .join("") +
      renderPaginationControls(
        tickets.length,
        visibleTickets.length,
        "reportes",
      );
  }
}

export function inspectSingleTractorEfficiency(idTractor) {
  const trcInput = document.getElementById("filter-history-tractor");
  const tabSel = document.getElementById("filter-history-tab");
  if (tabSel) tabSel.value = "RENDIMIENTO";
  if (trcInput) trcInput.value = idTractor;
  historyVisibleLimit = HISTORY_PAGE_SIZE;
  renderHistoryScreen();
}

export function openAdminEditFuel(idCarga) {
  if (!state.currentUser || state.currentUser.rol !== "ADMIN") return;
  const source = customRangeFuelLogs || state.dbFuelLogs || [];
  const log = source.find((x) => x.id_carga === idCarga);
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
  const source = customRangeTickets || state.dbTickets || [];
  const ticket = source.find((x) => x.id_servicio === idServicio);
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
    if (getActiveDateRange().hasRange) await onHistoryDateChange(false);
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
    if (getActiveDateRange().hasRange) await onHistoryDateChange(false);
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
    if (getActiveDateRange().hasRange) await onHistoryDateChange(false);
    showToast(`🗑️ Ticket #${idServicio} eliminado.`, "info");
  } catch (err) {
    handleAppError("Eliminación de ticket", err);
  }
}

export function exportDataCSV() {
  const { logs, baseSource, ranchFilter, tractorQuery, fromVal, toVal } =
    getFilteredDieselLogs();
  const { byId } = computeFuelEfficiencyData(baseSource);

  let csv =
    "ID_CARGA,TRACTOR,RANCHO_CARGA,LITROS,ACTIVIDAD,HOROMETRO,HORAS_TRABAJADAS,RENDIMIENTO_L_HR,USUARIO,FECHA\n";
  logs.forEach((l) => {
    const eff = byId.get(l.id_carga);
    const hrs = eff ? eff.deltaHours : "";
    const lph = eff ? eff.lph : "";
    csv += `${l.id_carga},${l.id_tractor},"${RANCH_NAMES[l.id_rancho_carga] || l.id_rancho_carga}",${l.litros},"${l.actividad}",${l.horometro || ""},${hrs},${lph},${l.id_usuario_diesel},${l.fecha_hora}\n`;
  });
  const unitTag = tractorQuery
    ? `_${normalizeSearchText(tractorQuery).replace(/\s+/g, "-")}`
    : "";
  const rangeTag =
    fromVal || toVal
      ? `${fromVal || "inicio"}_a_${toVal || "hoy"}`
      : "reciente";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `AgroFleet_${ranchFilter}${unitTag}_${rangeTag}.csv`;
  a.click();
  showToast(`CSV descargado (${logs.length} registros filtrados).`, "success");
}
