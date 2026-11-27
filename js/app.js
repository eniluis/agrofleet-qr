import { SESSION_KEY, state } from "./config.js";
import {
  sbFetch,
  loadOfflineQueue,
  flushOfflineQueue,
  showToast,
  handleAppError,
} from "./api.js";
import {
  handleLoginSubmit,
  startUserSession,
  logoutUser,
  switchScreen,
} from "./auth.js";
import {
  renderQuickTractors,
  clearQuickTractorSearch,
  selectTractor,
  toggleRealCamera,
  handleCreateTractor,
  renderQRVisualCard,
  downloadQRLabelPNG,
  printQRInPWA,
  shareQRLabelPWA,
  printTractorFromCatalog,
  renderTractorsCatalog,
  setCatalogRanchFilter,
  clearCatalogTractorSearch,
  openAdminEditTractor,
  closeAdminEditTractorModal,
  saveAdminTractorEdit,
  adminDeleteTractor,
} from "./qr-fleet.js";
import {
  updateCrossRanchBanner,
  setAreaFilter,
  renderFilteredActivities,
  setQuickLiters,
  toggleCustomActivity,
  openFuelConfirmModal,
  closeFuelConfirmModal,
  confirmAndSaveFuelLoad,
} from "./diesel.js";
import {
  selectFaultArea,
  setPriority,
  handlePhotoUpload,
  removeDraftPhoto,
  submitMaintenanceRequest,
  renderRole2MyTickets,
  renderRole3TicketList,
  openTicketForRepair,
  closeRole3Panel,
  setResolutionStatus,
  togglePurchaseItemsBox,
  togglePreventiveTag,
  submitRepairClosure,
  sendTicketWhatsAppAlert,
} from "./maintenance.js";
import {
  renderHistoryScreen,
  openAdminEditFuel,
  openAdminEditMnt,
  closeAdminEditModal,
  saveAdminRecordEdit,
  adminDeleteFuel,
  adminDeleteMnt,
  exportDataCSV,
} from "./history.js";

// ==================== RECEPCIÓN DE PARÁMETROS DESDE AGROPLAN ====================
function normalizeRanchParam(rawRanch) {
  if (!rawRanch) return null;
  const clean = rawRanch
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (clean.includes("EDEN")) return "EDEN";
  if (clean.includes("MATANUZKA")) return "MATANUZKA";
  if (clean.includes("ESPERANZA")) return "ESPERANZA";
  if (clean.includes("ARADOS")) return "ARADOS";
  return null;
}

function captureIncomingUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const screen = params.get("screen");
  const tractor = params.get("tractor");
  const rancho = params.get("rancho");
  const falla = params.get("falla");
  const ot = params.get("ot");
  const prioridad = params.get("prioridad");

  if (!screen && !tractor && !falla && !ot) return;

  state.incomingAgroPlanData = {
    screen: screen || "report-fault",
    tractor: tractor ? tractor.trim().toUpperCase() : null,
    rancho: normalizeRanchParam(rancho),
    falla: falla ? falla.trim() : "",
    ot: ot ? ot.trim() : null,
    prioridad: prioridad ? prioridad.trim().toUpperCase() : "URGENTE",
  };
}

export function applyIncomingAgroPlanParams() {
  const incoming = state.incomingAgroPlanData;
  if (!incoming || !state.currentUser) return;

  if (incoming.screen === "report-fault") {
    switchScreen("report-fault");
    selectFaultArea("MECANICO");

    if (incoming.tractor) {
      const exists = (state.dbTractors || []).some(
        (t) => t.id_tractor.toUpperCase() === incoming.tractor,
      );
      if (exists) {
        selectTractor(incoming.tractor);
      } else {
        state.selectedTractorId = incoming.tractor;
      }
    }

    if (incoming.rancho) {
      const ranchoSel = document.getElementById("select-fault-rancho");
      if (ranchoSel) ranchoSel.value = incoming.rancho;
    }

    setPriority(incoming.prioridad === "NORMAL" ? "NORMAL" : "URGENTE");

    const descEl = document.getElementById("input-fault-desc");
    if (descEl) {
      const prefix = incoming.ot ? `[AgroPlan OT #${incoming.ot}] ` : "";
      descEl.value = `${prefix}${incoming.falla}`.trim();
    }

    state.incomingOtOrigen = incoming.ot ? Number(incoming.ot) || null : null;
    showToast(
      `📋 Datos cargados desde AgroPlan${incoming.ot ? ` (OT #${incoming.ot})` : ""}. Adjunta foto si aplica y envía.`,
      "info",
    );
  }

  state.incomingAgroPlanData = null;
  window.history.replaceState({}, document.title, window.location.pathname);
}

// ==================== SINCRONIZACIÓN CENTRAL CON SUPABASE ====================
export async function syncAllFromSupabase(notify = false) {
  if (!state.isOnline) return;
  try {
    const [tractors, fuels, tickets, evidences] = await Promise.all([
      sbFetch("tractores?order=fecha_alta.desc"),
      sbFetch("cargas_diesel?order=fecha_hora.desc&limit=150"),
      sbFetch("servicios_mantenimiento?order=fecha_solicitud.desc&limit=150"),
      sbFetch("evidencias_servicio?order=fecha_subida.desc&limit=300"),
    ]);

    state.dbTractors = tractors || [];
    state.dbFuelLogs = fuels || [];
    state.dbTickets = tickets || [];
    state.dbEvidences = evidences || [];

    if (!state.selectedTractorId && state.dbTractors.length > 0) {
      state.selectedTractorId = state.dbTractors[0].id_tractor;
    }

    renderQuickTractors();
    renderTractorsCatalog();
    if (state.currentUser) {
      renderRole2MyTickets();
      renderRole3TicketList();
      if (
        !document.getElementById("screen-history").classList.contains("hidden")
      ) {
        renderHistoryScreen();
      }
      applyIncomingAgroPlanParams();
    }
    if (notify) showToast("✔ Datos actualizados desde Supabase.", "success");
  } catch (err) {
    if (notify) handleAppError("Sincronización", err);
  }
}

// ==================== MODO RED / OFFLINE ====================
function toggleNetworkMode() {
  state.isOnline = !state.isOnline;
  const pill = document.getElementById("network-pill");
  const dot = document.getElementById("network-dot");
  const txt = document.getElementById("network-text");

  if (state.isOnline) {
    pill.className =
      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition bg-emeraldAgro/90 border border-emerald-300/40 text-white shadow-sm shrink-0";
    dot.className = "w-2 h-2 rounded-full bg-emerald-300 animate-pulse";
    txt.textContent = "EN LÍNEA";
    flushOfflineQueue(() => syncAllFromSupabase(false));
  } else {
    pill.className =
      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition bg-amber-600 border border-amber-300 text-white shadow-sm shrink-0";
    dot.className = "w-2 h-2 rounded-full bg-amber-200";
    txt.textContent = "SIN SEÑAL";
    showToast(
      "Modo Sin Señal activado: los registros se guardarán localmente.",
      "info",
    );
  }
}

// ==================== SERVICE WORKER E INSTALACIÓN PWA ====================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const installBtn = document.getElementById("btn-install-pwa");
  if (installBtn) installBtn.classList.remove("hidden");
  document.getElementById("pwa-install-hint").textContent =
    "Instala AgroFleet QR como app nativa en tu inicio";
});

async function triggerPWAInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === "accepted") {
    document.getElementById("pwa-install-banner").classList.add("hidden");
    showToast("✔ App instalada en tu pantalla de inicio.", "success");
  }
  deferredInstallPrompt = null;
}

// ==================== EXPONER FUNCIONES AL HTML (onclick / onsubmit) ====================
Object.assign(window, {
  syncAllFromSupabase,
  toggleNetworkMode,
  triggerPWAInstall,
  handleLoginSubmit: (e) => handleLoginSubmit(e, syncAllFromSupabase),
  logoutUser,
  switchScreen,
  renderQuickTractors,
  clearQuickTractorSearch,
  selectTractor,
  toggleRealCamera,
  handleCreateTractor: (e) => handleCreateTractor(e, syncAllFromSupabase),
  renderQRVisualCard,
  downloadQRLabelPNG,
  printQRInPWA,
  shareQRLabelPWA,
  printTractorFromCatalog,
  renderTractorsCatalog,
  setCatalogRanchFilter,
  clearCatalogTractorSearch,
  openAdminEditTractor,
  closeAdminEditTractorModal,
  saveAdminTractorEdit: () => saveAdminTractorEdit(syncAllFromSupabase),
  adminDeleteTractor: (id) => adminDeleteTractor(id, syncAllFromSupabase),
  updateCrossRanchBanner,
  setAreaFilter,
  renderFilteredActivities,
  setQuickLiters,
  toggleCustomActivity,
  openFuelConfirmModal,
  closeFuelConfirmModal,
  confirmAndSaveFuelLoad: () => confirmAndSaveFuelLoad(syncAllFromSupabase),
  selectFaultArea,
  setPriority,
  handlePhotoUpload,
  removeDraftPhoto,
  submitMaintenanceRequest: () => submitMaintenanceRequest(syncAllFromSupabase),
  openTicketForRepair,
  closeRole3Panel,
  setResolutionStatus,
  togglePurchaseItemsBox,
  togglePreventiveTag,
  submitRepairClosure: () => submitRepairClosure(syncAllFromSupabase),
  notifyTicketWhatsApp: (data) =>
    sendTicketWhatsAppAlert({ ...data, tipoOrigen: "AVISO DE TALLER" }),
  renderHistoryScreen,
  openAdminEditFuel,
  openAdminEditMnt,
  closeAdminEditModal,
  saveAdminRecordEdit: () => saveAdminRecordEdit(syncAllFromSupabase),
  adminDeleteFuel: (id) => adminDeleteFuel(id, syncAllFromSupabase),
  adminDeleteMnt: (id) => adminDeleteMnt(id, syncAllFromSupabase),
  exportDataCSV,
});

window.addEventListener("online", () => {
  if (!state.isOnline) toggleNetworkMode();
});
window.addEventListener("offline", () => {
  if (state.isOnline) toggleNetworkMode();
});

// ==================== AUTO-SINCRONIZACIÓN AL VOLVER A LA APP ====================
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    state.isOnline &&
    state.currentUser
  ) {
    syncAllFromSupabase(false);
  }
});

window.addEventListener("focus", () => {
  if (state.isOnline && state.currentUser) {
    syncAllFromSupabase(false);
  }
});

// ==================== ARRANQUE DE APLICACIÓN ====================
window.addEventListener("DOMContentLoaded", async () => {
  captureIncomingUrlParams();
  loadOfflineQueue();
  renderFilteredActivities();

  const savedSession = localStorage.getItem(SESSION_KEY);
  if (savedSession) {
    try {
      const user = JSON.parse(savedSession);
      await startUserSession(user, syncAllFromSupabase);
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
      if (state.isOnline) await syncAllFromSupabase(false);
    }
  } else if (state.incomingAgroPlanData) {
    // Auto-acceso directo cuando se abre desde AgroPlan sin sesión previa en el navegador
    const bridgeUser = {
      id_usuario: "supervisor_agroplan",
      nombre: "Supervisor AgroPlan",
      rol: "SOLICITANTE_MNT",
      id_rancho: state.incomingAgroPlanData.rancho || null,
    };
    await startUserSession(bridgeUser, syncAllFromSupabase);
  } else if (state.isOnline) {
    syncAllFromSupabase(false);
  }

  setInterval(() => {
    if (
      state.isOnline &&
      state.currentUser &&
      document.visibilityState === "visible"
    ) {
      syncAllFromSupabase(false);
    }
  }, 45000);
});
