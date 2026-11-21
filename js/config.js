export const SUPABASE_URL = 'https://swgqjmowhdkzaodkyvpj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_1PeWHaPebHs1e_vqsqr6Fw_KvQjSl-e';
export const WORKSHOP_WHATSAPP_PHONE = '5214581073339';
export const RANCH_NAMES = {
    EDEN: 'El Edén',
    MATANUZKA: 'Matanuzka',
    ESPERANZA: 'La Esperanza',
    ARADOS: 'Arados'
};

export const OFFLINE_QUEUE_KEY = 'agrofleet_offline_queue_v2';
export const SESSION_KEY = 'agrofleet_user_session_v2';

export const ESPECIALIDADES_MNT = {
    MECANICO: {
        code: 'MECANICO',
        label: '🚜 Mecánico',
        shortLabel: 'Mecánico',
        responsable: 'Teófilo',
        requiresTractor: true,
        phone: '5214581073339' // Teléfono WhatsApp Teófilo
    },
    ELECTRICO: {
        code: 'ELECTRICO',
        label: '⚡ Eléctrico',
        shortLabel: 'Eléctrico',
        responsable: 'Teófilo',
        requiresTractor: false,
        phone: '5214581073339' // Teléfono WhatsApp Teófilo
    },
    SOLDADURA: {
        code: 'SOLDADURA',
        label: '🏗️ Soldadura (Corrales/Inst.)',
        shortLabel: 'Soldadura',
        responsable: 'Roberto Maldonado',
        requiresTractor: false,
        phone: '5214922889474' // Pon aquí el WhatsApp de Roberto Maldonado
    },
    HIDRAULICO: {
        code: 'HIDRAULICO',
        label: '💧 Hidráulico (Agua)',
        shortLabel: 'Hidráulico',
        responsable: 'Roberto Maldonado',
        requiresTractor: false,
        phone: '5214922889474' // Pon aquí el WhatsApp de Roberto Maldonado
    },
    ORDENA: {
        code: 'ORDENA',
        label: '🥛 Salas de Ordeña',
        shortLabel: 'Ordeña',
        responsable: 'Mauricio / Jesús Espino',
        requiresTractor: false,
        phoneByRanch: {
            EDEN: '5214651206668', // WhatsApp Mauricio Espino
            MATANUZKA: '5214581217077' // WhatsApp Jesús Espino
        },
        phone: '521XXXXXXXXXX'
    }
};

export const CATALOGO_ACTIVIDADES = [
    // CAMPO
    { id: 1, tarea: 'Sembrar maíz', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 2, tarea: 'Sembrar avena y triticale', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 3, tarea: 'Sembrar alfalfa', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 4, tarea: 'Tirar cintilla', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 5, tarea: 'Subsuelear', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 6, tarea: 'Rastrear', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 7, tarea: 'Cultivar (escardar)', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 8, tarea: 'Sellar', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 9, tarea: 'Fumigar (Campo)', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 11, tarea: 'Tirar composta', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 12, tarea: 'Compostear', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 13, tarea: 'Formar chorizos de estiércol', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 14, tarea: 'Ensilar maíz', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 15, tarea: 'Cortar alfalfa', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 16, tarea: 'Juntar alfalfa', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 17, tarea: 'Triturar alfalfa (ensilar alfalfa)', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 18, tarea: 'Transportar alfalfa cortada y triturada (ensilada)', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 19, tarea: 'Subir y pisar alfalfa', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 20, tarea: 'Cortar y triturar maíz', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 21, tarea: 'Transportar maíz cortado y triturado (ensilado)', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 22, tarea: 'Subir y pisar maíz', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 37, tarea: 'Triturar maíz (ensilar)', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 42, tarea: 'Cargar composta', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 49, tarea: 'Nivelar tierra', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 51, tarea: 'Desbarar', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 53, tarea: 'Campo (General)', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 64, tarea: 'Riegos', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 65, tarea: 'Tirar estiércol', area: 'CAMPO', areaLabel: 'Campo' },
    { id: 68, tarea: 'Tepetate', area: 'CAMPO', areaLabel: 'Campo' },

    // ESTABLO
    { id: 25, tarea: 'Barrer banquetas', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 26, tarea: 'Rastrear corrales', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 27, tarea: 'Juntar estiércol de corrales', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 28, tarea: 'Cargar estiércol de corrales', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 29, tarea: 'Vaciar fosas', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 30, tarea: 'Trasladar estiércol', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 31, tarea: 'Pichonear', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 38, tarea: 'Tirar camas', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 39, tarea: 'Peinar camas', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 47, tarea: 'Barrer corrales', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 48, tarea: 'Fumigar corrales', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 56, tarea: 'Fumigar (Establo)', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 59, tarea: 'Podar pasto', area: 'ESTABLO', areaLabel: 'Establo' },
    { id: 62, tarea: 'Rellenar agujeros', area: 'ESTABLO', areaLabel: 'Establo' },

    // ALIMENTACIÓN
    { id: 23, tarea: 'Pasturear', area: 'ALIMENTACION', areaLabel: 'Alimentación' },
    { id: 24, tarea: 'Arrimar comida a pesebres', area: 'ALIMENTACION', areaLabel: 'Alimentación' },
    { id: 35, tarea: 'Cargar pasturas', area: 'ALIMENTACION', areaLabel: 'Alimentación' },
    { id: 41, tarea: 'Moler pacas', area: 'ALIMENTACION', areaLabel: 'Alimentación' },
    { id: 50, tarea: 'Recoger sobrantes', area: 'ALIMENTACION', areaLabel: 'Alimentación' },
    { id: 60, tarea: 'Moler cebada', area: 'ALIMENTACION', areaLabel: 'Alimentación' },

    // COMPOSTA
    { id: 46, tarea: 'Trasladar composta', area: 'COMPOSTA', areaLabel: 'Composta' },
    { id: 57, tarea: 'Churros de composta', area: 'COMPOSTA', areaLabel: 'Composta' },
    { id: 69, tarea: 'Cribado', area: 'COMPOSTA', areaLabel: 'Composta' },

    // TRASLADOS
    { id: 44, tarea: 'Trasladar ganado', area: 'TRASLADOS', areaLabel: 'Traslados' },
    { id: 45, tarea: 'Trasladar pastura', area: 'TRASLADOS', areaLabel: 'Traslados' },
    { id: 55, tarea: 'Varios (Traslados)', area: 'TRASLADOS', areaLabel: 'Traslados' },

    // OTRAS ÁREAS
    { id: 52, tarea: 'Quesería', area: 'OTRAS', areaLabel: 'Quesería' },
    { id: 54, tarea: 'Crianza', area: 'OTRAS', areaLabel: 'Crianza' },
    { id: 58, tarea: 'Ordeña', area: 'OTRAS', areaLabel: 'Ordeña' },
    { id: 61, tarea: 'Construcción', area: 'OTRAS', areaLabel: 'Construcción' },
    { id: 63, tarea: 'Varios (Mantenimiento)', area: 'OTRAS', areaLabel: 'Mantenimiento' }
];

// Estado compartido entre módulos
export const state = {
    currentUser: null,
    isOnline: navigator.onLine,
    offlineQueue: [],
    dbTractors: [],
    dbFuelLogs: [],
    dbTickets: [],
    dbEvidences: [],
    selectedTractorId: null,
    selectedAreaFilter: 'TODAS',
    selectedFaultArea: 'MECANICO',
    selectedPriority: 'URGENTE',
    selectedResolution: 'FINALIZADO',
    activeTicketIdForRole3: null,
    role2DraftFiles: [],
    role3DraftFiles: [],
    pendingFuelDraftPayload: null,
    adminEditContext: null
};