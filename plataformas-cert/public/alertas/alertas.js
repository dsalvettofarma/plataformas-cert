// public/monitorAlertas/monitorAlertas.js

const SCRIPT_URL_MONITOR_ALERTAS = 'https://script.google.com/macros/s/AKfycbzvCnlQRlKnhWUaz1z6TFj4sHMOdyvCoNCqfy_a1Zb3yzScIqrRy3MqO49z7DE1DsV0/exec';

// --- Variables Globales para el Modal de Detalle ---
let alertaModalElement, modalDetalleTituloElement, modalDetalleCuerpoElement, modalDetalleCerrarBtnElement;

/**
 * Valida la sesión actual.
 */
function initMonitorAlertasGuards() {
  if (typeof requireSession !== 'function') {
    console.error('Error crítico: La función requireSession no está definida. Asegúrate que shared/authService.js se cargue antes.');
    const rootEl = document.querySelector('.monitor-alertas-root');
    if (rootEl) rootEl.innerHTML = '<p class="status-message error-message" style="padding:20px;">Error de configuración: Servicio de autenticación no disponible.</p>';
    return null;
  }
  const session = requireSession(['alertas'], 'https://plataformas-cert.web.app/login.html'); 
  
  if (!session) {
    console.log('Sesión no válida para Monitor de Alertas. Redirección manejada por requireSession.');
    return null;
  }
  console.log('Sesión válida para Monitor de Alertas.');
  return session;
}

/**
 * Realiza una petición al backend de Google Apps Script.
 */
function appsScriptRequest(action, params = {}, method = 'GET') {
  const sessionStr = localStorage.getItem('session');
  if (!sessionStr) {
    return Promise.reject(new Error('Sesión no encontrada en localStorage. Por favor, inicia sesión de nuevo.'));
  }
  const session = JSON.parse(sessionStr);
  
  const requestParams = {
    action,
    token: session.tmpToken, 
    email: session.email,    
    ...params
  };

  if (method.toUpperCase() === 'GET') { 
    const callbackName = 'jsonpCallback_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const queryParams = new URLSearchParams(requestParams);
    
    return new Promise((resolve, reject) => {
      let scriptElement = document.createElement('script');
      window[callbackName] = (data) => {
        delete window[callbackName];
        if (scriptElement && scriptElement.parentNode) {
          scriptElement.parentNode.removeChild(scriptElement);
        }
        if (data.error) {
          console.error(`Error devuelto por Apps Script (acción "${action}"):`, data.error);
          reject(new Error(data.error));
        } else {
          resolve(data);
        }
      };
      
      scriptElement.src = `${SCRIPT_URL_MONITOR_ALERTAS}?${queryParams.toString()}&callback=${callbackName}`;
      // console.log("URL JSONP generada:", scriptElement.src); 

      scriptElement.onerror = (event) => {
        delete window[callbackName];
        if (scriptElement && scriptElement.parentNode) {
          scriptElement.parentNode.removeChild(scriptElement);
        }
        console.error(`Error de red o script al cargar JSONP (acción "${action}"). Evento:`, event);
        reject(new Error('Error de red al contactar el servicio de alertas (JSONP). Revisa la URL del script y los permisos de deployment.'));
      };
      document.body.appendChild(scriptElement);
    });

  } else if (method.toUpperCase() === 'POST') { 
    // console.log(`Enviando POST a Apps Script. Acción: ${action}, Params:`, requestParams);
    return fetch(SCRIPT_URL_MONITOR_ALERTAS, {
        method: 'POST',
        mode: 'cors', 
        cache: 'no-cache',
        headers: {
             'Content-Type': 'text/plain;charset=utf-8', 
        },
        body: JSON.stringify(requestParams)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errData => {
                throw new Error(errData.message || `Error HTTP ${response.status} al realizar la acción.`);
            }).catch(() => new Error(`Error HTTP ${response.status} al realizar la acción.`));
        }
        return response.json();
    })
    .then(data => {
        if (data.success === false) {
            throw new Error(data.message || "La operación falló en el servidor.");
        }
        return data; 
    });
  } else {
    return Promise.reject(new Error(`Método HTTP no soportado: ${method}`));
  }
}

// --- Funciones del Modal de Detalle (Simplificadas) ---
function inicializarModalDetalle() {
  alertaModalElement = document.getElementById('alertaDetalleModal');
  modalDetalleTituloElement = document.getElementById('modalDetalleTitulo');
  modalDetalleCuerpoElement = document.getElementById('modalDetalleCuerpo');
  modalDetalleCerrarBtnElement = document.getElementById('modalDetalleCerrarBtn');
  // La sección de datos parseados la dejamos, pero no la usaremos activamente ahora.
  const modalDatosParseados = document.getElementById('modalDetalleDatosParseados');


  if (!alertaModalElement || !modalDetalleTituloElement || !modalDetalleCuerpoElement || !modalDetalleCerrarBtnElement) {
    console.error("Error: No se encontraron todos los elementos del modal de detalle en el DOM. Verifica el HTML.");
    return;
  }

  modalDetalleCerrarBtnElement.addEventListener('click', cerrarModalDetalle);
  alertaModalElement.addEventListener('click', (event) => {
    if (event.target === alertaModalElement) { 
      cerrarModalDetalle();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && alertaModalElement && !alertaModalElement.classList.contains('hidden')) {
      cerrarModalDetalle();
    }
  });
}

function abrirModalDetalle(titulo, cuerpoEmail) {
  if (!alertaModalElement || !modalDetalleTituloElement || !modalDetalleCuerpoElement) {
    console.error("Error: Modal de detalle no está completamente inicializado o elementos no encontrados.");
    return;
  }

  modalDetalleTituloElement.textContent = titulo || "Detalle de Alerta";
  console.log("Cuerpo del email para procesar:", JSON.stringify(cuerpoEmail));
  let contenidoHtmlProcesado = cuerpoEmail || "Cuerpo del email no disponible.";

  // --- INICIO: Lógica para OCULTAR bloques de texto específicos de la firma/disclaimer ---
  const bloquesAOcultar = [
    // 1. Firma de Diego Salvetto y datos de contacto hasta la URL de skin-club
    // Asume que "[<< Farmashop >>]" puede o no estar antes de Diego Salvetto
    // y captura desde Diego Salvetto hasta la segunda aparición de la URL de skin-club.
    /(?:\[Farmashop]\s*)?Diego Salvetto[\s\S]*?https:\/\/tienda\.farmashop\.com\.uy\/skin-club/gi,
    
    // 2. La imagen del GIF y su enlace
    /\[https:\/\/www\.farmashop\.com\.uy\/signatures\/_data\/ad-1\.gif\]<\S+>/gi,

    // 3. AVISO DE CONFIDENCIALIDAD completo (desde "AVISO..." hasta "...copiar su contenido.")
    /AVISO DE CONFIDENCIALIDAD:[\s\S]*?El contenido del presente mensaje es privado, estrictamente confidencial y exclusivo para sus destinatarios, pudiendo contener información protegida por normas legales y\/o secreto profesional\. Bajo ninguna circunstancia su contenido puede ser transmitido o revelado a terceros ni divulgado en forma alguna\. En consecuencia, de haberlo recibido por error, solicitamos contactar al remitente de inmediato y eliminarlo de su sistema. No deberá divulgar, distribuir o copiar su contenido\.\./gi,
    
    // 4. El bloque "[<< Farmashop >>]\n<< Antes >> de imprimir..." hasta "...gran impacto."
    /\[Farmashop\]\s*<< Antes >> de imprimir este mensaje[\s\S]*?gran impacto\./gi,

    // 5. La línea de guiones bajos (si es una línea de muchos guiones)
    /_{10,}\s*$/gm, // Busca 10 o más guiones bajos seguidos, posiblemente con espacios, al final de una línea (m para multilínea)

    // 6. El bloque "De: Farmashop <ecommerce@farmashop.com.uy>" y las líneas siguientes de Enviado, Para.
    // Esto es más general, hay que tener cuidado de no borrar demasiado si el formato cambia.
    // Captura desde "De: << Farmashop >>" hasta el final de la línea que contiene "Para:" y la dirección de email.
    // Este es el más complicado de hacer robusto sin ejemplos más variados.
    // Intentaremos una aproximación:
    /De: Farmashop <ecommerce@farmashop\.com\.uy>[\s\S]*?<ktettamanti@farmashop\.(?:com\.uy|uy)>/gi,
    
    /Para: [\s\S]*? E-commerce interno [\s\S]*? ; [\s\S]*? Karina Tettamanti [\s\S]*?  /gi,
    // Nota: He puesto (?:com\.uy|uy) para cubrir ambas terminaciones que vi en tu texto de ejemplo.
    // El [\s\S]*? entre "De:" y el final de la línea "Para:" es para capturar todo lo intermedio.
  ];

  bloquesAOcultar.forEach((regex, index) => {
    // console.log(`Aplicando regex ${index + 1}:`, regex); // Para depurar
    contenidoHtmlProcesado = contenidoHtmlProcesado.replace(regex, ""); 
  });
  
  // Limpiar múltiples saltos de línea que puedan quedar después de los reemplazos
  contenidoHtmlProcesado = contenidoHtmlProcesado.replace(/\n\s*\n{2,}/g, '\n\n'); // Reemplaza tres o más saltos de línea por dos
  contenidoHtmlProcesado = contenidoHtmlProcesado.trim(); // Quitar espacios/saltos de línea al inicio y final.

  // --- FIN: Lógica para OCULTAR bloques ---
  
  // Mantener el resaltado de "Con el documento" si aún lo quieres
  const textosAResaltar = ["documento", "usuario", "Información de envío", "Tarjeta:", "Método de envío", "Perfume", "Total general   $"]; 
  textosAResaltar.forEach(texto => {
    if (texto && typeof texto === 'string' && texto.trim() !== '') {
      const textoEscapado = texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexResaltar = new RegExp(`(${textoEscapado})`, 'gi'); 
      contenidoHtmlProcesado = contenidoHtmlProcesado.replace(regexResaltar, '<span class="texto-destacado-modal">$1</span>');
    }
  });
  
  modalDetalleCuerpoElement.innerHTML = `<pre>${contenidoHtmlProcesado}</pre>`; 
  
  const datosParseadosDiv = document.getElementById('modalDetalleDatosParseados');
  if (datosParseadosDiv) {
    datosParseadosDiv.innerHTML = '';
    datosParseadosDiv.style.display = 'none';
  }

  alertaModalElement.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function cerrarModalDetalle() {
  if (!alertaModalElement) return;
  alertaModalElement.classList.add('hidden');
  document.body.style.overflow = 'auto'; // Restaurar scroll
}

/**
 * Crea el elemento HTML para una alerta individual.
 */
function crearElementoAlerta(alerta, headers, headerMap) {
  const alertaDiv = document.createElement('div');
  alertaDiv.className = 'alerta-item';
  
  const getVal = (keyNormalizada) => {
    const headerReal = headerMap[keyNormalizada.toLowerCase().trim()];
    return (headerReal && alerta[headerReal] !== undefined && alerta[headerReal] !== null) ? alerta[headerReal] : '';
  };

  const uid = getVal('UID');
  alertaDiv.dataset.uid = uid; 

  let asunto = getVal('Asunto') || 'Asunto no disponible';
  asunto = asunto.replace(/^(rv: ?)/i, '').trim();

  const fechaOriginal = getVal('Timestamp');
  const fechaFormateada = fechaOriginal ? 
    new Date(fechaOriginal).toLocaleString('es-UY', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
    }) : 'Fecha desconocida';
  
  let revisado = getVal('Revisado');
  revisado = revisado ? revisado.toString().toLowerCase() === 'sí' : false;
  const estadoAlerta = getVal('Estado').toLowerCase();

  const cuerpoEmail = getVal('Cuerpo'); // Obtenemos el cuerpo para el modal

  alertaDiv.innerHTML = `
    <div class="alerta-contenido">
      <p class="alerta-asunto-display">${asunto}</p>
      <p class="alerta-fecha-display">${fechaFormateada}</p>
    </div>
    <div class="alerta-acciones">
      ${(!revisado && estadoAlerta === 'positivo' && uid) ? 
        `<button class="btn-marcar-revisado" data-uid="${uid}" title="Marcar como Revisado">
           <i class="fas fa-check-circle"></i> Marcar
         </button>` : 
        (revisado ? '<span class="revisado-texto">Revisado</span>' : '')}
    </div>
  `;

  const contenidoDiv = alertaDiv.querySelector('.alerta-contenido');
  if (contenidoDiv) {
      contenidoDiv.style.cursor = 'pointer'; 
      contenidoDiv.addEventListener('click', (event) => {
          abrirModalDetalle(asunto, cuerpoEmail); // Llamada simplificada al modal
      });
  }

  const btnMarcar = alertaDiv.querySelector('.btn-marcar-revisado');
  if (btnMarcar) {
    btnMarcar.addEventListener('click', async (event) => {
      event.stopPropagation(); 
      const uidParaMarcar = btnMarcar.dataset.uid;
      if (!uidParaMarcar) {
        alert("Error: UID no encontrado para esta alerta.");
        return;
      }
      btnMarcar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marcando...';
      btnMarcar.disabled = true;
      try {
        const resultado = await appsScriptRequest('markAsReviewed', { uid: uidParaMarcar }, 'POST');
        if (resultado.success) {
          alertaDiv.classList.add('alerta-desvaneciendo');
          setTimeout(async () => {
              alertaDiv.remove();
              const listaAlertasContent = document.getElementById('lista-alertas-content');
              if (listaAlertasContent && !listaAlertasContent.querySelector('.alerta-item')) {
                const noAlertasP = document.getElementById('no-alertas');
                if (noAlertasP) noAlertasP.classList.remove('hidden');
              }
              await cargarYFiltrarAlertas(); 
          }, 500); 
        } else {
          throw new Error(resultado.message || "Apps Script reportó fallo al marcar.");
        }
      } catch (error) {
        console.error(`Error al marcar UID ${uidParaMarcar} como revisado:`, error);
        alert(`Error al marcar alerta: ${error.message}`);
        btnMarcar.innerHTML = '<i class="fas fa-check-circle"></i> Marcar';
        btnMarcar.disabled = false;
      }
    });
  }
  return alertaDiv;
}

/**
 * Carga todas las alertas y luego las filtra y muestra.
 */
async function cargarYFiltrarAlertas() {
  const listaAlertasContent = document.getElementById('lista-alertas-content');
  const loadingAlertas = document.getElementById('loading-alertas');
  const noAlertas = document.getElementById('no-alertas');
  const errorAlertas = document.getElementById('error-alertas');

  const cuerpoTablaHistorial = document.getElementById('cuerpo-tabla-historial');
  const loadingHistorialRow = document.getElementById('loading-historial-row');
  const noHistorialRow = document.getElementById('no-historial-row');
  const errorHistorialRow = document.getElementById('error-historial-row');

  if (loadingAlertas) loadingAlertas.classList.remove('hidden');
  if (noAlertas) noAlertas.classList.add('hidden');
  if (errorAlertas) errorAlertas.classList.add('hidden');
  if (listaAlertasContent) listaAlertasContent.querySelectorAll('.alerta-item').forEach(item => item.remove());

  if (loadingHistorialRow) loadingHistorialRow.classList.remove('hidden');
  if (noHistorialRow) noHistorialRow.classList.add('hidden');
  if (errorHistorialRow) errorHistorialRow.classList.add('hidden');
  if (cuerpoTablaHistorial) cuerpoTablaHistorial.querySelectorAll('tr:not(#loading-historial-row):not(#no-historial-row):not(#error-historial-row)').forEach(row => row.remove());

  try {
    const response = await appsScriptRequest('getAlertData', {}, 'GET');
    if (loadingAlertas) loadingAlertas.classList.add('hidden');
    if (loadingHistorialRow) loadingHistorialRow.classList.add('hidden');

    if (response && response.data && Array.isArray(response.data) && response.headers && Array.isArray(response.headers)) {
      const todasLasAlertas = response.data;
      const headers = response.headers;
      const headerMap = {};
      headers.forEach(h => {
        if (typeof h === 'string') {
            headerMap[h.toLowerCase().trim()] = h;
        }
      });
      
      const ESTADO_KEY = headerMap['estado'];
      const REVISADO_KEY = headerMap['revisado'];
      const TIMESTAMP_KEY = headerMap['timestamp'];
      const UID_KEY = headerMap['uid'];
      const CUERPO_KEY = headerMap['cuerpo']; // Necesario para el modal

      if (!ESTADO_KEY || !REVISADO_KEY || !TIMESTAMP_KEY || !UID_KEY || !CUERPO_KEY) {
          let missingKeys = ['estado', 'revisado', 'timestamp', 'uid', 'cuerpo'].filter(k => !headerMap[k]);
          console.error(`Columnas esenciales (${missingKeys.join(', ')}) no encontradas. Headers:`, headers, "HeaderMap:", headerMap);
          throw new Error(`Columnas esenciales (${missingKeys.join(', ')}) no encontradas en encabezados. Revisa la hoja 'Alertas'.`);
      }
      
      const alertasPositivasNoRevisadas = todasLasAlertas.filter(alerta => {
        const estadoActual = alerta[ESTADO_KEY] ? alerta[ESTADO_KEY].toString().toLowerCase() : "";
        const revisadoActual = alerta[REVISADO_KEY] ? alerta[REVISADO_KEY].toString().toLowerCase() : "";
        return estadoActual === 'positivo' && revisadoActual !== 'sí';
      }).sort((a, b) => { 
          const dateA = a[TIMESTAMP_KEY] ? new Date(a[TIMESTAMP_KEY]) : null;
          const dateB = b[TIMESTAMP_KEY] ? new Date(b[TIMESTAMP_KEY]) : null;
          if (dateA && dateB) return dateB - dateA; 
          if (dateA) return -1; 
          if (dateB) return 1;  
          return 0; 
      });

      if (listaAlertasContent) {
          if (alertasPositivasNoRevisadas.length > 0) {
            alertasPositivasNoRevisadas.forEach(alertaFiltrada => {
              listaAlertasContent.appendChild(crearElementoAlerta(alertaFiltrada, headers, headerMap));
            });
          } else {
            if (noAlertas) noAlertas.classList.remove('hidden');
          }
      }

      const historialOrdenado = [...todasLasAlertas].sort((a,b) => { 
          const dateA = a[TIMESTAMP_KEY] ? new Date(a[TIMESTAMP_KEY]) : null;
          const dateB = b[TIMESTAMP_KEY] ? new Date(b[TIMESTAMP_KEY]) : null;
          if (dateA && dateB) return dateB - dateA;
          if (dateA) return -1;
          if (dateB) return 1;
          return 0;
      });
      
      if (cuerpoTablaHistorial) {
          if (historialOrdenado.length > 0) {
            historialOrdenado.forEach((item, index) => {
              const fila = cuerpoTablaHistorial.insertRow();
              const getValHist = (keyNormalizada) => {
                  const headerReal = headerMap[keyNormalizada.toLowerCase().trim()];
                  return headerReal && item[headerReal] !== undefined && item[headerReal] !== null ? item[headerReal] : 'N/A';
              };
              const estadoHistClase = String(getValHist('estado')).toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'desconocido';
              const revisadoHistClase = String(getValHist('revisado')).toLowerCase() === 'sí' ? 'si' : 'no';

              fila.innerHTML = `
                <td class="col-number">${index + 1}</td>
                <td>${getValHist('timestamp') ? new Date(getValHist('timestamp')).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'medium' }) : 'N/A'}</td>
                <td>${getValHist('asunto')}</td>
                <td class="estado-${estadoHistClase}">${getValHist('estado')}</td>
                <td class="revisado-${revisadoHistClase}">${getValHist('revisado')}</td>
              `;
            });
          } else {
             if (noHistorialRow) noHistorialRow.classList.remove('hidden');
          }
      }

    } else { 
      console.warn('Respuesta de getAlertData no tiene formato esperado.', response);
      if (noAlertas) noAlertas.classList.remove('hidden');
      if (noHistorialRow) noHistorialRow.classList.remove('hidden');
      if (errorAlertas) {
        errorAlertas.textContent = 'Error: Formato de datos incorrecto del servidor.';
        errorAlertas.classList.remove('hidden');
      }
      const errorHistorialCell = errorHistorialRow ? errorHistorialRow.querySelector('td') : null;
      if(errorHistorialCell) {
        errorHistorialCell.textContent = 'Error: Formato de datos incorrecto para historial.';
      }
      if (errorHistorialRow) errorHistorialRow.classList.remove('hidden');
    }
  } catch (error) { 
    console.error('Catch general en cargarYFiltrarAlertas:', error);
    if (loadingAlertas) loadingAlertas.classList.add('hidden');
    if (errorAlertas) {
        errorAlertas.textContent = `Error al cargar datos: ${error.message}`;
        errorAlertas.classList.remove('hidden');
    }

    if (loadingHistorialRow) loadingHistorialRow.classList.add('hidden');
    const errorHistorialCell = errorHistorialRow ? errorHistorialRow.querySelector('td') : null;
    if(errorHistorialCell) {
      errorHistorialCell.textContent = `Error al cargar historial: ${error.message}`;
    }
    if (errorHistorialRow) errorHistorialRow.classList.remove('hidden');
  }
}

/**
 * Inicializa el monitor de alertas.
 */
function initMonitorAlertas() {
  console.log('Inicializando Monitor de Alertas...');
  inicializarModalDetalle(); // Asegúrate que esto se llama para configurar el modal
  
  // No he visto un botón de refrescar en tu HTML, si lo tienes, descomenta esto.
  // const btnRefrescar = document.querySelector('.monitor-alertas-root .btn-refrescar-datos');
  // if (btnRefrescar) {
  //   btnRefrescar.addEventListener('click', cargarYFiltrarAlertas);
  // }
  cargarYFiltrarAlertas();
}

// --- Punto de Entrada Principal ---
const sessionValidaMonitor = initMonitorAlertasGuards();

if (sessionValidaMonitor) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initMonitorAlertas();
  } else {
    document.addEventListener('DOMContentLoaded', initMonitorAlertas);
  }
} else {
    console.log("Monitor de Alertas no se inicializará debido a sesión inválida o falta de permisos.");
}