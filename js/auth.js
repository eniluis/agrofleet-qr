import { RANCH_NAMES, SESSION_KEY, state } from './config.js';
import { sbFetch, showToast, handleAppError } from './api.js';
import { stopCameraIfRunning, renderQuickTractors, renderTractorsCatalog } from './qr-fleet.js';
import { renderFilteredActivities, updateCrossRanchBanner } from './diesel.js';
import { renderDraftPhotos, renderRole2MyTickets, renderRole3TicketList } from './maintenance.js';
import { renderHistoryScreen } from './history.js';

export async function handleLoginSubmit(event) {
    event.preventDefault();
    const idInput = document.getElementById('login-username').value.trim().toLowerCase();
    const pinInput = document.getElementById('login-pin').value.trim();
    await authenticateUser(idInput, pinInput);
}

export async function authenticateUser(idUsuario, pin) {
    const btn = document.getElementById('btn-login-submit');
    btn.disabled = true;
    btn.textContent = 'VERIFICANDO EN SUPABASE...';

    try {
        const rows = await sbFetch(
            `usuarios_roles?id_usuario=eq.${encodeURIComponent(idUsuario)}&pin=eq.${encodeURIComponent(pin)}&activo=eq.true&select=*`
        );
        if (!rows || rows.length === 0) {
            showToast('Usuario o PIN incorrecto en la base de datos.', 'error');
            document.getElementById('login-pin').value = '';
            return;
        }
        await startUserSession(rows[0]);
    } catch (err) {
        handleAppError('Inicio de sesión', err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'INGRESAR AL SISTEMA →';
    }
}

export async function startUserSession(user, syncFn) {
    state.currentUser = user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));

    const bar = document.getElementById('active-role-bar');
    const badge = document.getElementById('role-pill-badge');
    const userName = document.getElementById('active-user-name');
    const subtitle = document.getElementById('header-rancho-subtitle');

    bar.classList.remove('hidden');
    const ranchName = user.id_rancho ? (RANCH_NAMES[user.id_rancho] || user.id_rancho) : 'Todos los Ranchos';
    subtitle.textContent = `Rancho Activo: ${ranchName}`;
    userName.textContent = user.nombre;

    if (user.rol === 'ADMIN') {
        badge.textContent = 'ADMIN · TOTAL';
        badge.className = 'px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase bg-emeraldAgro text-amber-200 border border-amber-300/40 shrink-0';
    } else if (user.rol === 'DIESEL') {
        badge.textContent = `DIÉSEL · ${ranchName.toUpperCase()}`;
        badge.className = 'px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase bg-harvestGold text-white shrink-0';
    } else if (user.rol === 'SOLICITANTE_MNT') {
        badge.textContent = 'SOLICITANTE';
        badge.className = 'px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase bg-barnTerra text-white shrink-0';
    } else if (user.rol === 'TECNICO_MNT') {
        badge.textContent = 'TALLER';
        badge.className = 'px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase bg-emeraldAgro text-white shrink-0';
    }

    buildRoleNavigation(user.rol);
    if (syncFn) await syncFn(false);

    if (user.rol === 'ADMIN' || user.rol === 'DIESEL') {
        switchScreen('diesel');
    } else if (user.rol === 'SOLICITANTE_MNT') {
        switchScreen('report-fault');
    } else if (user.rol === 'TECNICO_MNT') {
        switchScreen('workshop');
    }

    showToast(`Bienvenido, ${user.nombre} (${ranchName}).`, 'success');
}

export function buildRoleNavigation(rol) {
    const nav = document.getElementById('bottom-nav');
    nav.classList.remove('hidden');

    let items = [];
    if (rol === 'ADMIN') {
        items = [
            { id: 'diesel', label: 'Diésel', icon: '⛽' },
            { id: 'tractors-qr', label: 'Alta/QR', icon: '🏁' },
            { id: 'report-fault', label: 'Falla', icon: '⚠️' },
            { id: 'workshop', label: 'Taller', icon: '🔧' },
            { id: 'history', label: 'Bitácora', icon: '📊' }
        ];
    } else if (rol === 'DIESEL') {
        items = [
            { id: 'diesel', label: 'Cargar Diésel', icon: '⛽' },
            { id: 'tractors-qr', label: 'Alta Tractor/QR', icon: '🏁' },
            { id: 'history', label: 'Bitácora Rancho', icon: '📋' }
        ];
    } else if (rol === 'SOLICITANTE_MNT') {
        items = [
            { id: 'report-fault', label: 'Reportar Falla', icon: '⚠️' },
            { id: 'history', label: 'Mis Reportes', icon: '📋' }
        ];
    } else if (rol === 'TECNICO_MNT') {
        items = [
            { id: 'workshop', label: 'Bandeja Taller', icon: '🔧' },
            { id: 'history', label: 'Historial Taller', icon: '📋' }
        ];
    }

    nav.innerHTML = items.map(it => `
    <button type="button" onclick="switchScreen('${it.id}')" id="nav-${it.id}"
      class="nav-item-btn flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-stone-500 font-semibold text-[10px] transition">
      <span class="text-base leading-none mb-0.5">${it.icon}</span>
      <span class="truncate max-w-full">${it.label}</span>
    </button>
  `).join('');
}

export function logoutUser() {
    state.currentUser = null;
    sessionStorage.removeItem(SESSION_KEY);
    stopCameraIfRunning();
    document.getElementById('login-username').value = '';
    document.getElementById('login-pin').value = '';
    document.getElementById('active-role-bar').classList.add('hidden');
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('header-rancho-subtitle').textContent = 'El Edén · Matanuzka · La Esperanza · Arados';
    switchScreen('login');
    showToast('Sesión cerrada.', 'info');
}

export function switchScreen(screenName) {
    stopCameraIfRunning();

    if (screenName !== 'login' && !state.currentUser) {
        screenName = 'login';
    } else if (state.currentUser) {
        const allowedByRole = {
            ADMIN: ['diesel', 'tractors-qr', 'report-fault', 'workshop', 'history'],
            DIESEL: ['diesel', 'tractors-qr', 'history'],
            SOLICITANTE_MNT: ['report-fault', 'history'],
            TECNICO_MNT: ['workshop', 'history']
        };
        if (!allowedByRole[state.currentUser.rol].includes(screenName)) {
            showToast('Acceso denegado para tu rol.', 'error');
            return;
        }
    }

    ['screen-login', 'screen-diesel', 'screen-tractors-qr', 'screen-report-fault', 'screen-workshop', 'screen-history']
    .forEach(id => document.getElementById(id).classList.add('hidden'));

    document.getElementById('qr-scanner-module').classList.add('hidden');

    document.querySelectorAll('.nav-item-btn').forEach(btn => {
        btn.classList.remove('text-forest', 'font-extrabold', 'bg-emerald-50');
        btn.classList.add('text-stone-500', 'font-semibold');
    });

    const activeNav = document.getElementById(`nav-${screenName}`);
    if (activeNav) {
        activeNav.classList.remove('text-stone-500', 'font-semibold');
        activeNav.classList.add('text-forest', 'font-extrabold', 'bg-emerald-50');
    }

    if (screenName === 'login') {
        document.getElementById('screen-login').classList.remove('hidden');
    } else if (screenName === 'diesel') {
        document.getElementById('qr-scanner-module').classList.remove('hidden');
        document.getElementById('screen-diesel').classList.remove('hidden');
        document.getElementById('admin-ranch-selector-box').classList.toggle('hidden', state.currentUser.rol !== 'ADMIN');
        renderQuickTractors();
        renderFilteredActivities();
        updateCrossRanchBanner();
    } else if (screenName === 'tractors-qr') {
        document.getElementById('screen-tractors-qr').classList.remove('hidden');
        if (state.currentUser.id_rancho) {
            document.getElementById('new-trc-rancho').value = state.currentUser.id_rancho;
        }
        renderTractorsCatalog();
    } else if (screenName === 'report-fault') {
        document.getElementById('qr-scanner-module').classList.remove('hidden');
        document.getElementById('screen-report-fault').classList.remove('hidden');
        if (state.currentUser.id_rancho) {
            document.getElementById('select-fault-rancho').value = state.currentUser.id_rancho;
        }
        renderQuickTractors();
        renderDraftPhotos('role2');
        renderRole2MyTickets();
    } else if (screenName === 'workshop') {
        document.getElementById('screen-workshop').classList.remove('hidden');
        renderRole3TicketList();
    } else if (screenName === 'history') {
        document.getElementById('screen-history').classList.remove('hidden');
        document.getElementById('admin-history-filters').classList.toggle('hidden', state.currentUser.rol !== 'ADMIN');
        renderHistoryScreen();
    }
}