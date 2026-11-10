/**
 * Patch para GameRooms - Intenta hacer que el juego funcione offline
 * Este script debe cargarse ANTES de main-B95SF9Gf.js
 */

(function() {
    console.log('🔧 GameRooms Offline Patch: Iniciando...');
    
    // Crear un mock de GameRooms que responde a todos los métodos
    const GameRoomsMock = {
        connect: async () => {
            console.log('🎮 GameRooms.connect() - Mock exitoso');
            return Promise.resolve();
        },
        addListener: async (type, callback) => {
            console.log('🎮 GameRooms.addListener() - Mock exitoso');
            // Llamar al callback inmediatamente con un mensaje "open"
            if (callback) {
                setTimeout(() => {
                    callback({ type: 'open' });
                }, 10);
            }
            return Promise.resolve({ remove: () => {} });
        },
        send: async () => {
            console.log('🎮 GameRooms.send() - Mock exitoso');
            return Promise.resolve();
        },
        close: async () => {
            console.log('🎮 GameRooms.close() - Mock exitoso');
            return Promise.resolve();
        },
        verify: async () => {
            console.log('🎮 GameRooms.verify() - Mock exitoso');
            return Promise.resolve({ token: 'mock-token' });
        },
        cancelVerification: async () => {
            console.log('🎮 GameRooms.cancelVerification() - Mock exitoso');
            return Promise.resolve();
        },
        request: async () => {
            console.log('🎮 GameRooms.request() - Mock exitoso');
            return Promise.resolve({ body: '{}', status: 200 });
        },
        cancel: async () => {
            console.log('🎮 GameRooms.cancel() - Mock exitoso');
            return Promise.resolve();
        }
    };
    
    // Monkey-patchar el módulo loader para interceptar la carga de GameRooms
    const originalDefineProperty = Object.defineProperty;
    
    // Intentar interceptar cuando el juego asigna Bi (GameRooms)
    Object.defineProperty = function(obj, prop, descriptor) {
        if (prop === 'Bi' && descriptor.value) {
            console.log('🎮 Interceptando asignación de Bi (GameRooms)');
            descriptor.value = GameRoomsMock;
        }
        return originalDefineProperty.call(this, obj, prop, descriptor);
    };
    
    // Método más agresivo: buscar en todas las propiedades del window
    const checkAndReplace = () => {
        // Buscar Bi en window
        if (window.Bi && window.Bi !== GameRoomsMock) {
            console.log('🎮 Encontrado window.Bi, reemplazando con mock');
            window.Bi = GameRoomsMock;
        }
        
        // Buscar en todas las propiedades del objeto window
        for (let prop in window) {
            try {
                const val = window[prop];
                if (val && typeof val === 'object' && val !== GameRoomsMock) {
                    // Verificar si tiene métodos de GameRooms
                    if (val.connect || val.addListener || val.send) {
                        console.log(`🎮 Encontrado posible GameRooms en window.${prop}, reemplazando`);
                        window[prop] = GameRoomsMock;
                    }
                }
            } catch (e) {
                // Ignorar errores de propiedades no accesibles
            }
        }
    };
    
    // Chequear agresivamente
    const interval = setInterval(checkAndReplace, 50);
    
    // Dejar de intentar después de 10 segundos
    setTimeout(() => {
        clearInterval(interval);
        console.log('🎮 Dejé de buscar GameRooms después de 10 segundos');
    }, 10000);
    
    // Chequear inmediatamente
    checkAndReplace();
    
    console.log('✅ GameRooms Offline Patch: Listo');
})();
