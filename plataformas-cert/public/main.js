// public/main.js

/**
 * Capitaliza la primera letra de un string y reemplaza guiones bajos/otros por espacios.
 * @param {string} str La cadena a capitalizar.
 * @returns {string} La cadena capitalizada.
 */
function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/_/g, ' ') // Reemplaza guiones bajos
    .replace(/-/g, ' ') // Reemplaza guiones medios
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Carga dinámicamente el HTML, CSS y JS de una sección específica del dashboard.
 * Se asigna a window para ser accesible globalmente si es necesario.
 * @param {string} sectionName El nombre de la sección a cargar (debe coincidir con el nombre de la carpeta).
 */
window.loadSection = async function loadSection(sectionName) {
  const mainContentArea = document.getElementById('main-content');
  if (!mainContentArea) {
    console.error('CRITICAL ERROR: Elemento #main-content no encontrado en el DOM.');
    return;
  }
  
  mainContentArea.innerHTML = '<p class="initial-loading-message">Cargando sección...</p>'; 
  mainContentArea.classList.remove('section-allow-horizontal-scroll');
  
  console.log(`Iniciando carga de sección: ${sectionName}`);

  try {
    // 1. Cargar HTML de la sección
    const htmlResponse = await fetch(`${sectionName}/${sectionName}.html`);
    if (!htmlResponse.ok) {
      throw new Error(`No se pudo cargar el archivo HTML de la sección '${sectionName}' (Estado: ${htmlResponse.status})`);
    }
    const htmlContent = await htmlResponse.text();
    mainContentArea.innerHTML = htmlContent;
    console.log(`HTML de '${sectionName}' cargado correctamente.`);

    // 2. Inyectar CSS de la sección (si no existe ya)
    const cssId = `css-${sectionName}`;
    if (document.getElementById(cssId)) { // Si ya existe, removerlo para recargar si es necesario (útil en desarrollo)
        // document.getElementById(cssId).remove(); 
        // O simplemente no hacer nada si asumimos que el CSS no cambia dinámicamente después de la primera carga.
        // Por ahora, solo lo añade si no existe.
    }
    if (!document.getElementById(cssId)) {
      const linkElement = document.createElement('link');
      linkElement.id = cssId;
      linkElement.rel = 'stylesheet';
      linkElement.href = `${sectionName}/${sectionName}.css`;
      document.head.appendChild(linkElement);
      console.log(`CSS '${sectionName}.css' inyectado.`);
    }


    // 3. Cargar y ejecutar JS de la sección (si existe)
    const scriptId = `script-${sectionName}`;
    const oldScriptElement = document.getElementById(scriptId);
    if (oldScriptElement) {
      oldScriptElement.remove();
      console.log(`Script anterior '${scriptId}' removido.`);
    }
    
    // Intentar cargar el JS.
    try {
      const scriptResponse = await fetch(`${sectionName}/${sectionName}.js`);
      if (scriptResponse.ok) { // Solo intentar añadir si el script existe (status 200)
        await new Promise((resolve, reject) => {
          const scriptElement = document.createElement('script');
          scriptElement.id = scriptId;
          scriptElement.src = `${sectionName}/${sectionName}.js`; // La URL real
          scriptElement.onload = () => {
            console.log(`Script '${sectionName}.js' cargado y ejecutado.`);
            resolve();
          };
          scriptElement.onerror = (event) => {
            console.error(`Error al cargar el script '${sectionName}.js'.`, event);
            // No rechazar la promesa aquí si el script es opcional, pero sí loguear.
            // Si el script es esencial y no carga, la sección podría no funcionar.
            resolve(); // Resolvemos igualmente para no romper la carga de HTML/CSS
          };
          document.body.appendChild(scriptElement);
        });
      } else if (scriptResponse.status === 404) {
        console.log(`Script '${sectionName}.js' no encontrado (404). La sección podría no tener JS o la ruta es incorrecta.`);
      } else {
        console.warn(`Advertencia: Problema al intentar obtener '${sectionName}.js'. Estado: ${scriptResponse.status}`);
      }
    } catch (fetchScriptError) {
      console.warn(`Error de red o fetch al intentar cargar ${sectionName}.js:`, fetchScriptError);
    }


    // 4. Lógica específica post-carga de script (si es necesario)
    if (sectionName === 'inspector' && typeof window.precargar === 'function') {
      console.log('Ejecutando window.precargar() para la sección inspector.');
      await window.precargar();
    }
    // Nota: home.js ya se ejecuta por sí mismo al cargarse, no necesita llamada explícita aquí.
    // Si monitorAlertas.js necesita una función de inicialización llamada explícitamente después de cargar,
    // se podría hacer aquí, pero su estructura actual se auto-ejecuta.

    // 5. Marcar la sección activa en el menú lateral
    const menuItems = document.querySelectorAll('#sidebar-menu li');
    menuItems.forEach(item => {
      item.classList.remove('active');
      if (item.dataset.section === sectionName) {
        item.classList.add('active');
      }
    });

  } catch (error) {
    console.error(`Error completo al cargar la sección '${sectionName}':`, error);
    mainContentArea.innerHTML = `
      <div class="error-message-placeholder">
        <h2><i class="fas fa-exclamation-triangle"></i> Error al Cargar Sección</h2>
        <p>No se pudo cargar la sección '<strong>${capitalize(sectionName)}</strong>'.</p>
        <p><em>Detalle: ${error.message}</em></p>
        <p>Por favor, intenta de nuevo o contacta a soporte si el problema persiste.</p>
      </div>`;
  }
};

/**
 * Alterna la visibilidad del sidebar.
 */
window.toggleSidebar = () => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
    console.log('Sidebar toggled. Hidden:', sidebar.classList.contains('hidden'));
  } else {
    console.error('Elemento #sidebar no encontrado al intentar toggle.');
  }
};

/**
 * Limpia los datos de sesión y redirige a la página de login.
 */
function logoutUser() {
  console.log("Cerrando sesión...");
  // Limpieza específica de ítems de sesión
  localStorage.removeItem('session');
  localStorage.removeItem('sessionTimestamp');
  // Considera si hay otros ítems específicos del dashboard que limpiar.
  // localStorage.clear(); // Borra TODO localStorage para este dominio. Usar con precaución.

  // Redirigir a la página de login
  // Asegúrate que la ruta sea la correcta desde la raíz de tu sitio.
  window.location.href = 'login.html'; // Ajusta si es /login.html o /login/login.html
}

/**
 * Inicialización del Dashboard cuando el DOM está completamente cargado.
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM completamente cargado. Iniciando dashboard...');

  // --- 1. Inicialización del Tema ---
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)").matches;
    let currentTheme = localStorage.getItem('theme') || (prefersDarkScheme ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeToggle.checked = (currentTheme === 'light');
    
    themeToggle.addEventListener('change', () => {
      const newTheme = themeToggle.checked ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      console.log(`Tema cambiado a: ${newTheme}`);
    });
  } else {
    console.warn('Elemento #theme-toggle no encontrado.');
  }

  // --- 2. Validación de Sesión ---
  if (typeof requireSession !== 'function') {
    console.error('CRITICAL ERROR: La función requireSession no está definida. authService.js no cargado o incorrecto.');
    document.body.innerHTML = '<p style="color:red; padding:20px; text-align:center;">Error crítico de configuración: Servicio de autenticación no disponible. Por favor, contacta a soporte.</p>';
    return;
  }
  const session = requireSession([], 'login.html'); // Ajusta la ruta de login si es necesario
  if (!session) {
    console.log('Sesión no válida o expirada. Redirección en curso por requireSession.');
    return; 
  }
  console.log('Sesión validada:', session);

  // --- 3. Renderizado de Datos de Usuario en el Header ---
  const userNameElement = document.getElementById('user-name');
  const userRoleElement = document.getElementById('user-role');
  if (userNameElement) userNameElement.textContent = session.nombre || 'N/A';
  else console.warn('Elemento #user-name no encontrado.');
  if (userRoleElement) userRoleElement.textContent = session.rol || 'N/A';
  else console.warn('Elemento #user-role no encontrado.');

// --- 4. Construcción del Menú Lateral ---
// --- 4. Construcción del Menú Lateral ---
    const sidebarMenu = document.getElementById('sidebar-menu');
    if (!sidebarMenu) {
        console.error('CRITICAL ERROR: Elemento #sidebar-menu no encontrado.');
        return;
    }
    sidebarMenu.innerHTML = '';

    // Función auxiliar para crear ítems de menú
    function crearItemDeMenu(texto, nombreIconoTabler, nombreSeccion) { // nombreIconoTabler es solo el nombre, ej: "home", "settings"
        const listItem = document.createElement('li');
        // ASEGÚRATE QUE ESTA LÍNEA ESTÉ ASÍ:
        listItem.innerHTML = `<i class="ti ti-${nombreIconoTabler}"></i> <span class="nav-label">${texto}</span>`;
        listItem.dataset.section = nombreSeccion;
        listItem.setAttribute('role', 'menuitem');
        listItem.tabIndex = 0; 
        listItem.addEventListener('click', () => window.loadSection(nombreSeccion));
        listItem.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') window.loadSection(nombreSeccion);
        });
        return listItem;
    }

    // Ítem de Inicio
    sidebarMenu.appendChild(crearItemDeMenu('Inicio', 'home', 'home')); // 'home' es el nombre del icono de Tabler

    const mainMenuItemsContainer = document.createElement('div');
    mainMenuItemsContainer.className = 'sidebar-main-items';

    if (session.permisos && Array.isArray(session.permisos) && session.permisos.length > 0) {
        console.log('Permisos del usuario para construir menú:', session.permisos);

        const seccionesConocidas = {
            // Clave: nombre del permiso en minúsculas (ej. 'permiso_config_alertas')
            // Valor: { texto: 'Texto Menu', icono: 'nombre-icono-tabler', sectionName: 'nombreCarpeta' }
            'inspector': { texto: 'Inspector Pagos', icono: 'user-search', sectionName: 'inspector' }, // o 'search'
            'alertas': { texto: 'Monitor Alertas', icono: 'bell-exclamation', sectionName: 'monitorAlertas' },
            'consultas': { texto: 'Consultas', icono: 'help-circle', sectionName: 'consultas' }, // Ejemplo, busca el icono que quieras
            'reportes': { texto: 'Reportes', icono: 'chart-bar', sectionName: 'reportes' }, // Ejemplo
            'configalertas': { texto: 'Config. Alertas', icono: 'bell-cog', sectionName: 'configalertas' } // Si tu carpeta es 'configalertas'
        };

        session.permisos.forEach(permRaw => {
            const permNormalizado = String(permRaw).toLowerCase().trim();

            if (permNormalizado === 'home' || permNormalizado === 'configuracion') { 
                 return; 
            }

            const configSeccion = seccionesConocidas[permNormalizado];

            if (configSeccion) {
                mainMenuItemsContainer.appendChild(
                    crearItemDeMenu(configSeccion.texto, configSeccion.icono, configSeccion.sectionName)
                );
            } else {
                console.warn(`Permiso '${permNormalizado}' no encontrado en 'seccionesConocidas'. Creando ítem genérico.`);
                mainMenuItemsContainer.appendChild(
                    crearItemDeMenu(capitalize(permNormalizado), 'tool', permNormalizado) 
                );
            }
        });
    } else {
        console.warn('No hay permisos adicionales asignados al usuario para generar ítems de menú.');
    }
    sidebarMenu.appendChild(mainMenuItemsContainer);

    const sidebarFooterItems = document.createElement('div');
    sidebarFooterItems.className = 'sidebar-footer-items';
    const logoutListItem = document.createElement('li');
    // Para "Cerrar Sesión", el icono es 'logout'
    logoutListItem.innerHTML = `<i class="ti ti-logout"></i> <span class="nav-label">Cerrar Sesión</span>`;
    logoutListItem.setAttribute('role', 'menuitem');
    logoutListItem.tabIndex = 0;
    logoutListItem.classList.add('logout-button'); 
    logoutListItem.addEventListener('click', logoutUser);
    logoutListItem.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') logoutUser();
    });
    sidebarFooterItems.appendChild(logoutListItem);
    sidebarMenu.appendChild(sidebarFooterItems);

    const headerTitleLink = document.getElementById('header-title-link');
    if (headerTitleLink) {
        headerTitleLink.addEventListener('click', () => window.loadSection('home'));
    }
    window.loadSection('home');
});
  // --- 5. Event Listener para el Título del Header ---
  const headerTitleLink = document.getElementById('header-title-link');
  if (headerTitleLink) {
    headerTitleLink.addEventListener('click', () => window.loadSection('home'));
  } else {
    console.warn("Elemento #header-title-link no encontrado para hacerlo clickeable.");
  }


  window.loadSection('home');

console.log('main.js cargado y listeners configurados.');