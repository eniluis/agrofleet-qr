import { SESSION_KEY, state } from './config.js';
import { sbFetch, loadOfflineQueue, flushOfflineQueue, showToast, handleAppError } from './api.js';
import { handleLoginSubmit, startUserSession, logoutUser, switchScreen } from './auth.js';
import {
    renderQuickTractors,
    selectTractor,
    toggleRealCamera,
    handleCreateTractor,
    renderQRVisualCard,
    downloadQRLabelPNG,
    printQRInPWA,
    shareQRLabelPWA,
    printTractorFromCatalog,
    renderTractorsCatalog,
    openAdminEditTractor,
    closeAdminEditTractorModal,
    saveAdminTractorEdit,
    adminDeleteTractor
} from './qr-fleet.js';
import {
    updateCrossRanchBanner,
    setAreaFilter,
    renderFilteredActivities,
    setQuickLiters,
    toggleCustomActivity,
    openFuelConfirmModal,
    closeFuelConfirmModal,
    confirmAndSaveFuelLoad
} from './diesel.js';
import {
    setPriority,
    handlePhotoUpload,
    removeDraftPhoto,
    submitMaintenanceRequest,
    renderRole2MyTickets,
    renderRole3TicketList,
    openTicketForRepair,
    closeRole3Panel,
    setResolutionStatus,
    submitRepairClosure
} from './maintenance.js';
import {
    renderHistoryScreen,
    openAdminEditFuel,
    openAdminEditMnt,
    closeAdminEditModal,
    saveAdminRecordEdit,
    adminDeleteFuel,
    adminDeleteMnt,
    exportDataCSV
} from './history.js';

// ==================== SINCRONIZACIÓN CENTRAL CON SUPABASE ====================
export async function syncAllFromSupabase(notify = false) {
    if (!state.isOnline) return;
    try {
        const [tractors, fuels, tickets, evidences] = await Promise.all([
            sbFetch('tractores?order=fecha_alta.desc'),
            sbFetch('cargas_diesel?order=fecha_hora.desc&limit=150'),
            sbFetch('servicios_mantenimiento?order=fecha_solicitud.desc&limit=150'),
            sbFetch('evidencias_servicio?order=fecha_subida.desc&limit=300')
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
            if (!document.getElementById('screen-history').classList.contains('hidden')) {
                renderHistoryScreen();
            }
        }
        if (notify) showToast('✔ Datos actualizados desde Supabase.', 'success');
    } catch (err) {
        if (notify) handleAppError('Sincronización', err);
    }
}

// ==================== MODO RED / OFFLINE ====================
function toggleNetworkMode() {
    state.isOnline = !state.isOnline;
    const pill = document.getElementById('network-pill');
    const dot = document.getElementById('network-dot');
    const txt = document.getElementById('network-text');

    if (state.isOnline) {
        pill.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition bg-emeraldAgro/90 border border-emerald-300/40 text-white shadow-sm shrink-0';
        dot.className = 'w-2 h-2 rounded-full bg-emerald-300 animate-pulse';
        txt.textContent = 'EN LÍNEA';
        flushOfflineQueue(() => syncAllFromSupabase(false));
    } else {
        pill.className = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition bg-amber-600 border border-amber-300 text-white shadow-sm shrink-0';
        dot.className = 'w-2 h-2 rounded-full bg-amber-200';
        txt.textContent = 'SIN SEÑAL';
        showToast('Modo Sin Señal activado: los registros se guardarán localmente.', 'info');
    }
}

// ==================== SERVICE WORKER E INSTALACIÓN PWA ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) installBtn.classList.remove('hidden');
    document.getElementById('pwa-install-hint').textContent = 'Instala AgroFleet QR como app nativa en tu inicio';
});

async function triggerPWAInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
        document.getElementById('pwa-install-banner').classList.add('hidden');
        showToast('✔ App instalada en tu pantalla de inicio.', 'success');
    }
    deferredInstallPrompt = null;
}

// ==================== EXPONER FUNCIONES AL HTML (onclick / onsubmit) ====================
Object.assign(window, {
    syncAllFromSupabase,
    toggleNetworkMode,
    triggerPWAInstall,
    handleLoginSubmit,
    logoutUser,
    switchScreen,
    selectTractor,
    toggleRealCamera,
    handleCreateTractor: (e) => handleCreateTractor(e, syncAllFromSupabase),
    renderQRVisualCard,
    downloadQRLabelPNG,
    printQRInPWA,
    shareQRLabelPWA,
    printTractorFromCatalog,
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
    setPriority,
    handlePhotoUpload,
    removeDraftPhoto,
    submitMaintenanceRequest: () => submitMaintenanceRequest(syncAllFromSupabase),
    openTicketForRepair,
    closeRole3Panel,
    setResolutionStatus,
    submitRepairClosure: () => submitRepairClosure(syncAllFromSupabase),
    renderHistoryScreen,
    openAdminEditFuel,
    openAdminEditMnt,
    closeAdminEditModal,
    saveAdminRecordEdit: () => saveAdminRecordEdit(syncAllFromSupabase),
    adminDeleteFuel: (id) => adminDeleteFuel(id, syncAllFromSupabase),
    adminDeleteMnt: (id) => adminDeleteMnt(id, syncAllFromSupabase),
    exportDataCSV
});

window.addEventListener('online', () => { if (!state.isOnline) toggleNetworkMode(); });
window.addEventListener('offline', () => { if (state.isOnline) toggleNetworkMode(); });

// ==================== ARRANQUE DE APLICACIÓN ====================
window.addEventListener('DOMContentLoaded', async() => {
    loadOfflineQueue();
    renderFilteredActivities();
    const savedSession = sessionStorage.getItem(SESSION_KEY);
    if (savedSession) {
        try {
            const user = JSON.parse(savedSession);
            await startUserSession(user, syncAllFromSupabase);
        } catch (e) {
            sessionStorage.removeItem(SESSION_KEY);
        }
    }
});