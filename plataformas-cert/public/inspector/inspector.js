// public/inspector/inspector.js
// -----------------------------------------------------------
// INSPECTOR DE PAGOS – Dashboard modular con Google Sheets
// -----------------------------------------------------------

/* ========================== 0. GUARDIAS Y PREPARACIÓN ========================== */
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxqiejSj2Y7bLLJBHf6fE_7vfotLDSukaR6evUkbFXoZwufIa1m5p3_Pc0iwpmYYJZZ/exec';
const NOMBRE_COLUMNA_FECHA_POR_DEFECTO = "Fecha"; // <<--- ¡¡¡IMPORTANTE: CAMBIA ESTO AL NOMBRE EXACTO DE TU COLUMNA DE FECHA PRINCIPAL!!!

/**
 * Valida sesión (expira en 1h) y permiso 'inspector'.
 * Si no cumple, limpia storage y redirige a login con redirect.
 * @returns {boolean}
 */
function initGuards() {
  const sessionStr = localStorage.getItem('session');
  const tsStr = localStorage.getItem('sessionTimestamp');
  const ts = tsStr ? parseInt(tsStr, 10) : 0;

  if (!sessionStr || !ts || (Date.now() - ts) > 3600000) { // 1 hora
    localStorage.clear();
    const redirect = encodeURIComponent(location.pathname + location.search);
    window.location.href = `/login.html?redirect=${redirect}`; // Ajusta ruta a login si es necesario
    return false;
  }

  const session = JSON.parse(sessionStr);
  if (!Array.isArray(session.permisos) || !session.permisos.includes('inspector')) {
    document.body.innerHTML = '<h2>🛑 Acceso denegado</h2><p>No tienes permiso para ver esta sección.</p>';
    return false;
  }
  return true;
}

/* ========================== 1. INICIALIZACIÓN DOM Y EVENT LISTENERS ========================== */
document.addEventListener('DOMContentLoaded', async () => {
  if (!initGuards()) return;

  const sheetSelect = document.getElementById('sheet');
  const valueInput = document.getElementById('value-input');
  const loadBtn = document.getElementById('btnPrecargar');
  const searchBtn = document.getElementById('btnBuscar');
  const btnLimpiarFechas = document.getElementById('btnLimpiarFechas');
  // No es necesario obtener columnSelect, table, estado aquí si las funciones las obtienen internamente

  console.log("DOM cargado para Inspector, iniciando precarga inicial...");
  await precargar();

  let debounceTimer;
  if (valueInput) {
    valueInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log("Input detectado en #value-input, llamando a buscar() con debounce.");
        buscar();
      }, 500); // 500ms de espera
    });
    // Listener para Enter en valueInput
    valueInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            if(searchBtn) searchBtn.click(); // Simula clic en botón buscar
        }
    });
  } else {
    console.warn("Elemento #value-input no encontrado.");
  }


  if (sheetSelect) {
    sheetSelect.addEventListener('change', async () => {
      const hojaSeleccionada = sheetSelect.value;
      console.log(`Usuario cambió la hoja a: "${hojaSeleccionada}". Iniciando precarga...`);
      await precargar();
      const resultsTable = document.getElementById('results');
      if(resultsTable) resultsTable.innerHTML = ''; // Limpiar tabla
      if(valueInput) valueInput.value = ''; // Limpiar campo de búsqueda de texto
    });
  } else {
    console.warn("Elemento #sheet (select de hojas) no encontrado.");
  }

  if (loadBtn) loadBtn.addEventListener('click', async () => {
    console.log("Botón 'Precargar hoja' clickeado.");
    await precargar();
  });
  if (searchBtn) searchBtn.addEventListener('click', buscar);
  if (btnLimpiarFechas) btnLimpiarFechas.addEventListener('click', limpiarFiltroFechas);

  // Exponer funciones globales necesarias para botones inline en HTML
  window.cargarHojas = async () => { 
      console.log("Refrescando lista de hojas y precargando la actual...");
      if(sheetSelect) sheetSelect.innerHTML = ''; 
      await precargar();
  };
  window.analizarAnulados = analizarAnulados;
  window.analizarErrores  = analizarErrores;
  window.mostrarUltimo    = mostrarUltimo;
  window.precargar        = precargar;
  window.buscar           = buscar;
  window.limpiarFiltroFechas = limpiarFiltroFechas;
});

/* ========================== 2. JSONP HELPERS Y LLAMADAS ========================== */
function jsonpRequest(action, params = {}) {
  const session = JSON.parse(localStorage.getItem('session'));
  if (!session || !session.tmpToken || !session.email) {
    console.error("Error: Sesión no encontrada o incompleta para jsonpRequest.");
    const estadoEl = document.getElementById('estado');
    if (estadoEl) estadoEl.innerText = "❌ Error de sesión. Por favor, re-ingresa.";
    return Promise.reject(new Error("Sesión inválida o no encontrada en localStorage."));
  }
  const qs = new URLSearchParams({ action, token: session.tmpToken, email: session.email, ...params });
  const url = `${ENDPOINT}?${qs.toString()}`;
  return jsonp(url).then(resp => {
    if (resp.error) {
      console.error(`Error devuelto por Apps Script (acción ${action}):`, resp.error);
      throw new Error(resp.error);
    }
    return resp;
  }).catch(networkError => {
      console.error(`Error de red o JSONP para acción ${action}:`, networkError);
      const estadoEl = document.getElementById('estado');
      if(estadoEl) estadoEl.innerText = `❌ Error de conexión con el servidor.`;
      throw networkError; // Re-lanzar para que se maneje en el catch de la función que llama
  });
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    let script = document.createElement('script');
    window[callbackName] = data => {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
      resolve(data);
    };
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
    script.onerror = () => {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
      reject(new Error('Error de red o script en JSONP (script.onerror). URL: ' + script.src));
    };
    document.body.appendChild(script);
  });
}

function ordenarHeaders(headers) {
  if (!Array.isArray(headers)) return [];
  const prioridad = ["Id usuario", "Nombre", "Email de usuario", "Fecha", "Fecha Anulacion/Devolucion", "Estado", "Mensaje de respuesta"];
  const ocultar = ["Id (Auth-conf)", "Propina", "Ley que aplico", "Devolucion de impuesto", "Codigo de autorizacion", "Moneda", "Ticket", "Numero de de comercio", "Numero de terminal", "Ref. enviada al autorizador", "Ref. devuelta por el autorizador", "Proceso Aut."];
  const visibles = headers.filter(h => !ocultar.includes(String(h)));
  const principales = prioridad.filter(h => visibles.includes(String(h)));
  const otros = visibles.filter(h => !principales.includes(String(h)));
  return [...principales, ...otros];
}

/* ========================== 3. PRECARGA Y CACHÉ ========================== */
let overlayTimeout = null;
function showOverlaySpinner() {
  const spinner = document.getElementById("overlay-spinner");
  if (spinner) {
    clearTimeout(overlayTimeout); // Limpiar timeout anterior si existe
    overlayTimeout = setTimeout(() => { spinner.style.display = "flex"; }, 250); // Mostrar un poco antes
  }
}
function hideOverlaySpinner() {
  clearTimeout(overlayTimeout);
  const spinner = document.getElementById("overlay-spinner");
  if (spinner) spinner.style.display = "none";
}

async function precargar() {
  showOverlaySpinner();
  const sheetSelectEl = document.getElementById('sheet');
  const columnSelectEl = document.getElementById('column');
  const estadoEl = document.getElementById('estado');
  const overlayTextEl = document.getElementById('overlay-text');

  let hojaParaPrecargar = sheetSelectEl ? sheetSelectEl.value : null;
  console.log(`Iniciando precarga. Hoja seleccionada inicialmente: "${hojaParaPrecargar}"`);

  let start = Date.now();
  const msgCargando = "⏳ Precargando datos…";
  if (estadoEl) estadoEl.innerText = msgCargando;
  if (overlayTextEl) overlayTextEl.textContent = msgCargando;

  let timerId = setInterval(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const currentMsg = `${msgCargando} ${elapsed}s`;
    const spinnerVisible = document.getElementById("overlay-spinner")?.style.display !== "none";

    if (estadoEl && document.body.contains(estadoEl)) estadoEl.innerText = currentMsg;
    if (overlayTextEl && spinnerVisible && document.body.contains(overlayTextEl)) overlayTextEl.textContent = currentMsg;
    
    if ((!estadoEl || !document.body.contains(estadoEl)) && (!overlayTextEl || !spinnerVisible)) {
      clearInterval(timerId);
      timerId = null;
    }
  }, 200);

  try {
    if (!sheetSelectEl) throw new Error("Elemento select de hojas (#sheet) no encontrado.");
    
    if (sheetSelectEl.options.length === 0) {
      console.log("Select de hojas vacío. Obteniendo lista de todas las hojas...");
      const { sheets } = await jsonpRequest('getSheets');
      if (sheets && sheets.length > 0) {
        populateSelect(sheetSelectEl, sheets);
        hojaParaPrecargar = sheetSelectEl.value; 
        console.log(`Select de hojas poblado. Hoja seleccionada por defecto: "${hojaParaPrecargar}"`);
      } else { throw new Error("No se encontraron hojas (sheets) para cargar."); }
    } else {
        hojaParaPrecargar = sheetSelectEl.value; // Usar la hoja ya seleccionada
        console.log(`Select de hojas ya poblado. Usando hoja seleccionada: "${hojaParaPrecargar}"`);
    }

    if (!hojaParaPrecargar) throw new Error("No hay una hoja seleccionada o disponible para precargar.");

    console.log(`Precargando datos para la hoja: "${hojaParaPrecargar}"...`);
    const { headers } = await jsonpRequest('getHeaders', { sheet: hojaParaPrecargar });
    if (!headers || headers.length === 0) throw new Error("No se recibieron encabezados para la hoja.");
    
    const { results: rows } = await jsonpRequest('search', {
      sheet: hojaParaPrecargar, column: 'todos', value: '__all__', matchType: 'contains'
    });

    const headersOrdenados = ordenarHeaders(headers);
    window.cacheData = { sheet: hojaParaPrecargar, headers, headersOrdenados, rows: rows || [], ts: Date.now() }; // Asegurar rows como array
    console.log(`Datos cacheados para "${hojaParaPrecargar}": ${(rows || []).length} filas.`);

    if (columnSelectEl) {
      columnSelectEl.innerHTML = ""; 
      const optAll = document.createElement("option");
      optAll.value = "__all__"; optAll.textContent = "🔍 Buscar en todo"; columnSelectEl.appendChild(optAll);
      headersOrdenados.forEach(h => {
        const opt = document.createElement("option");
        opt.value = h; opt.textContent = h; columnSelectEl.appendChild(opt);
      });
      columnSelectEl.value = "__all__";
    }

    if(timerId) clearInterval(timerId); 
    timerId = null;
    const elapsedFinal = ((Date.now() - start) / 1000).toFixed(1);
    const mensajeExito = `✅ Hoja "${hojaParaPrecargar}" precargada en ${elapsedFinal}s • ${(rows || []).length} registros.`;
    if (estadoEl && document.body.contains(estadoEl)) estadoEl.innerText = mensajeExito;
    if (overlayTextEl && document.getElementById("overlay-spinner")?.style.display !== "none") {
        // overlayTextEl.textContent = `✅ ¡Listo!`; 
    }

  } catch (err) {
    if (timerId) clearInterval(timerId);
    timerId = null;
    console.error('Error detallado durante la precarga:', err);
    const mensajeError = `❌ Error al precargar: ${err.message}`;
    if (estadoEl && document.body.contains(estadoEl)) estadoEl.innerText = mensajeError;
    if (overlayTextEl && document.getElementById("overlay-spinner")?.style.display !== "none") {
        overlayTextEl.textContent = `❌ Error`;
    }
    window.cacheData = null;
  } finally {
    if (timerId) clearInterval(timerId); // Asegurar limpieza final
    hideOverlaySpinner();
  }
}

function cacheExpirada() {
  return !window.cacheData || (Date.now() - window.cacheData.ts) > 30 * 60 * 1000;
}

/* ========================== 4. BÚSQUEDA Y FILTRADO ========================== */
function limpiarFiltroFechas() {
  const fechaDesdeInput = document.getElementById('fecha-desde');
  const fechaHastaInput = document.getElementById('fecha-hasta');
  if (fechaDesdeInput) fechaDesdeInput.value = '';
  if (fechaHastaInput) fechaHastaInput.value = '';
  console.log("Filtro de fechas limpiado.");
  const estadoEl = document.getElementById('estado');
  if (estadoEl) estadoEl.innerText = "Filtro de fechas limpiado. Presiona Buscar para actualizar.";
  // buscar(); // Opcional
}

function buscar() {
  const estadoEl = document.getElementById('estado');
  const tableEl = document.getElementById('results');

  if (!estadoEl || !tableEl) {
    console.error("Elementos de estado o tabla no encontrados en buscar().");
    return;
  }

  if (cacheExpirada() || !window.cacheData || !window.cacheData.rows) {
    window.cacheData = null;
    estadoEl.innerText = '⚠️ Precarga expirada o datos no disponibles. Por favor, precarga la hoja.';
    tableEl.innerHTML = '<tr><td colspan="100%" style="text-align:center;">Precarga expirada.</td></tr>';
    return;
  }

  const { headers, rows: todasLasFilasOriginales, sheet: currentSheetName } = window.cacheData;
  if (!Array.isArray(todasLasFilasOriginales)) {
      estadoEl.innerText = `ℹ️ No hay datos cacheados válidos para la hoja "${currentSheetName}".`;
      tableEl.innerHTML = '<tr><td colspan="100%" style="text-align:center;">No hay datos cacheados.</td></tr>';
      return;
  }
  
  const columnaTexto = document.getElementById('column').value;
  const valorTextoInput = document.getElementById('value-input').value;
  const valorTexto = valorTextoInput ? valorTextoInput.trim().toLowerCase() : "";
  const tipoMatchTexto = document.getElementById('match-select').value;
  const fechaDesdeStr = document.getElementById('fecha-desde').value;
  const fechaHastaStr = document.getElementById('fecha-hasta').value;

  let start = Date.now();
  estadoEl.innerText = `⏳ Buscando...`;
  tableEl.innerHTML = '<tr><td colspan="100%" style="text-align:center; padding:20px;">Buscando... <i class="fas fa-spinner fa-spin"></i></td></tr>';

  let filasFiltradas = [...todasLasFilasOriginales];

  // --- 1. Aplicar Filtro de Fechas ---
  const nombreColumnaFecha = NOMBRE_COLUMNA_FECHA_POR_DEFECTO; 
  const indiceColumnaFecha = headers.indexOf(nombreColumnaFecha);

  if (indiceColumnaFecha !== -1 && (fechaDesdeStr || fechaHastaStr)) {
    console.log(`Aplicando filtro de fechas: Desde "${fechaDesdeStr}" Hasta "${fechaHastaStr}" en columna "${nombreColumnaFecha}"`);
    let filtroDesde = null;
    if (fechaDesdeStr) {
      const partsDesde = fechaDesdeStr.split('-');
      filtroDesde = new Date(parseInt(partsDesde[0]), parseInt(partsDesde[1]) - 1, parseInt(partsDesde[2]));
      filtroDesde.setHours(0, 0, 0, 0);
    }
    let filtroHasta = null;
    if (fechaHastaStr) {
      const partsHasta = fechaHastaStr.split('-');
      filtroHasta = new Date(parseInt(partsHasta[0]), parseInt(partsHasta[1]) - 1, parseInt(partsHasta[2]));
      filtroHasta.setHours(23, 59, 59, 999);
    }

    filasFiltradas = filasFiltradas.filter(fila => {
      const valorCeldaFecha = fila[indiceColumnaFecha];
      if (valorCeldaFecha === null || valorCeldaFecha === undefined || valorCeldaFecha === '') return false;
      
      let fechaDeLaFila;
      if (valorCeldaFecha instanceof Date && !isNaN(valorCeldaFecha)) {
        fechaDeLaFila = valorCeldaFecha;
      } else if (typeof valorCeldaFecha === 'string') {
        const parts = valorCeldaFecha.match(/(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
        if (parts) {
          fechaDeLaFila = new Date(
            parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]),
            parts[4] ? parseInt(parts[4]) : 0, parts[5] ? parseInt(parts[5]) : 0, parts[6] ? parseInt(parts[6]) : 0
          );
        } else {
          fechaDeLaFila = new Date(valorCeldaFecha);
        }
      } else if (typeof valorCeldaFecha === 'number') {
         fechaDeLaFila = new Date(valorCeldaFecha);
      } else { return false; }

      if (!fechaDeLaFila || isNaN(fechaDeLaFila.getTime())) return false;
      
      const fechaDeLaFilaNormalizada = new Date(fechaDeLaFila.getFullYear(), fechaDeLaFila.getMonth(), fechaDeLaFila.getDate());

      let pasaDesde = !filtroDesde || fechaDeLaFilaNormalizada >= filtroDesde;
      let pasaHasta = !filtroHasta || fechaDeLaFilaNormalizada <= filtroHasta;
      return pasaDesde && pasaHasta;
    });
    console.log(`${filasFiltradas.length} filas después del filtro de fecha.`);
  } else if (indiceColumnaFecha === -1 && (fechaDesdeStr || fechaHastaStr)) {
    if (estadoEl) estadoEl.innerText = `⚠️ Columna de fecha "${nombreColumnaFecha}" no encontrada. Se ignoró filtro de fecha.`;
  }

  // --- 2. Aplicar Filtro de Texto ---
  if (valorTexto) {
    if (columnaTexto === "__all__") {
      filasFiltradas = filasFiltradas.filter(row =>
        Array.isArray(row) && row.some(celda => (celda !== null && celda !== undefined) ? celda.toString().toLowerCase().includes(valorTexto) : false)
      );
    } else {
      const colIdxTexto = headers.indexOf(columnaTexto);
      if (colIdxTexto !== -1) {
        filasFiltradas = filasFiltradas.filter(row => {
          const celda = (Array.isArray(row) && row[colIdxTexto] !== undefined && row[colIdxTexto] !== null) ? row[colIdxTexto].toString().toLowerCase() : '';
          return tipoMatchTexto === 'exact' ? celda === valorTexto : celda.includes(valorTexto);
        });
      } else {
        if (estadoEl) estadoEl.innerText = `⚠️ Columna de texto "${columnaTexto}" no encontrada. Se ignoró filtro de texto.`;
      }
    }
    console.log(`${filasFiltradas.length} filas después del filtro de texto.`);
  }
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  const estadoFinalEl = document.getElementById('estado'); 

  if (filasFiltradas.length === 0) {
    if (tableEl) tableEl.innerHTML = '<tr><td colspan="100%" style="text-align:center; padding:20px;">⚠️ Sin resultados para los filtros aplicados.</td></tr>';
    if (estadoFinalEl) estadoFinalEl.innerText = `⚠️ Sin resultados (${elapsed}s)`;
  } else {
    const headersOrdenados = ordenarHeaders(headers);
    const idxsParaRender = headersOrdenados.map(h => headers.indexOf(h)); // Índices basados en los headers originales
    renderizarTabla(filasFiltradas, headersOrdenados, idxsParaRender, headers); // Pasar headers originales
    if (estadoFinalEl) estadoFinalEl.innerText = `✅ ${filasFiltradas.length} resultado${filasFiltradas.length !== 1 ? 's' : ''} encontrados en ${elapsed}s.`;
  }
}

/* ========================== 5. RENDERIZADO DE TABLA Y FORMATEO ========================== */
function ajustarYFormatear(fechaStr) {
  if (!fechaStr) return '';
  let fecha = new Date(fechaStr);

  if (isNaN(fecha.getTime()) && typeof fechaStr === 'string') {
    const parts = fechaStr.match(/(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
    if (parts) {
      fecha = new Date(
        parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]),
        parts[4] ? parseInt(parts[4]) : 0, parts[5] ? parseInt(parts[5]) : 0, parts[6] ? parseInt(parts[6]) : 0
      );
    }
  }

  if (isNaN(fecha.getTime())) {
    return fechaStr; 
  }

  // =====> INSERTA LA LÍNEA DE AJUSTE AQUÍ <=====
  fecha.setHours(fecha.getHours() - 4); 
  // =============================================

  const opciones = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    timeZone: 'America/Montevideo' 
  };
  try {
    // Aunque hayas ajustado manualmente, mantener timeZone puede ser útil
    // si la fecha base aún tuviera algún componente de zona horaria inherente
    // o para asegurar el formato local específico de Uruguay además de la hora.
    // Si después de restar las 4 horas, la opción timeZone causa otro desfase,
    // podrías considerar eliminarla, pero prueba primero con el ajuste manual.
    return fecha.toLocaleString('es-UY', opciones);
  } catch (e) {
    console.error("Error formateando fecha con es-UY:", e, "Fallback a formato ISO simplificado.");
    const pad = (num) => String(num).padStart(2, '0');
    // Asegúrate que el fallback también use la fecha ya ajustada
    return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`;
  }
}

function renderizarTabla(filas, headersOrdenadosParaMostrar, idxsDeOriginalesParaRenderizar, headersOriginalesCompletos) {
  const tableEl = document.getElementById("results");
  if (!tableEl) { console.error("Elemento #results de tabla no encontrado en renderizarTabla."); return; }
  tableEl.innerHTML = "";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const thIndex = document.createElement("th");
  thIndex.textContent = "#";
  thIndex.className = "col-index";
  headerRow.appendChild(thIndex);
  headersOrdenadosParaMostrar.forEach(hText => {
    const th = document.createElement("th");
    th.textContent = hText;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  tableEl.appendChild(thead);

  const tbody = document.createElement("tbody");
  filas.forEach((filaOriginal, rowIndex) => { // filaOriginal es un array de datos crudos
    const tr = document.createElement("tr");
    const tdIndexNum = document.createElement("td");
    tdIndexNum.textContent = rowIndex + 1;
    tdIndexNum.className = "col-index";
    tr.appendChild(tdIndexNum);

    // idxsDeOriginalesParaRenderizar contiene los índices de las columnas originales
    // que corresponden al orden de headersOrdenadosParaMostrar
    idxsDeOriginalesParaRenderizar.forEach(originalColIndex => {
      const td = document.createElement("td");
      // Obtener el valor crudo de la fila original usando el índice original
      let valorCrudo = (filaOriginal && filaOriginal[originalColIndex] !== undefined && filaOriginal[originalColIndex] !== null) 
                       ? filaOriginal[originalColIndex] 
                       : "";
      
      let valorMostrado = valorCrudo; // Por defecto, mostrar el valor crudo

      // Formatear si es una columna de fecha
      const nombreHeaderOriginal = headersOriginalesCompletos[originalColIndex];
      if (nombreHeaderOriginal && nombreHeaderOriginal.toLowerCase().includes('fecha')) {
        valorMostrado = ajustarYFormatear(String(valorCrudo));
      } else {
        valorMostrado = String(valorCrudo); // Asegurar que sea string para textContent
      }
      td.textContent = valorMostrado;

      // Lógica de resaltado de estado (usar valorCrudo para la lógica)
      if (nombreHeaderOriginal === "Estado") {
        const estadoCrudoTexto = String(valorCrudo).toLowerCase();
        if (estadoCrudoTexto === "rechazado") {
          td.style.color = "#a94442"; td.style.fontWeight = "bold";
        } else if (estadoCrudoTexto === "autorizado") {
          td.style.color = "#2e7d32"; td.style.fontWeight = "bold";
        } else if (estadoCrudoTexto === "anulado") {
          const fechaPagoIdx = headersOriginalesCompletos.indexOf(NOMBRE_COLUMNA_FECHA_POR_DEFECTO);
          const fechaAnulacionIdx = headersOriginalesCompletos.indexOf("Fecha Anulacion/Devolucion");

          if (fechaPagoIdx !== -1 && fechaAnulacionIdx !== -1) {
            const fechaPagoCruda = filaOriginal[fechaPagoIdx];
            const fechaAnulacionCruda = filaOriginal[fechaAnulacionIdx];
            
            const fechaPago = new Date(fechaPagoCruda); // Parsear aquí también
            const fechaAnulacion = new Date(fechaAnulacionCruda);

            if (!isNaN(fechaPago.getTime()) && !isNaN(fechaAnulacion.getTime())) {
                const diferenciaMs = fechaAnulacion - fechaPago;
                const diferenciaMin = diferenciaMs / 60000;
                if (diferenciaMin >= 0 && diferenciaMin < 4) { // Asegurar que no sea negativo y menor a 4
                    td.textContent = "Anulado automático"; // Sobrescribe el valor ya formateado
                    td.style.color = "#b36b00"; td.style.fontWeight = "bold";
                } else {
                    td.style.color = "#555"; td.style.fontWeight = "bold";
                }
            } else {
                 td.style.color = "#555"; td.style.fontWeight = "bold";
            }
          } else {
             td.style.color = "#555"; td.style.fontWeight = "bold";
          }
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  tableEl.appendChild(tbody);
}

/* ========================== 6. HELPERS DE UI ========================== */
function populateSelect(selectEl, items) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  items.forEach(item => {
    const opt = document.createElement('option');
    // Si item es un objeto con value/text (no es el caso aquí para sheets/headers)
    // opt.value = (typeof item === 'object' && item.value !== undefined) ? item.value : String(item);
    // opt.textContent = (typeof item === 'object' && item.text !== undefined) ? item.text : String(item);
    opt.value = String(item); // Asumir que 'items' es un array de strings
    opt.textContent = String(item);
    selectEl.appendChild(opt);
  });
}

/* ========================== 7. VALIDACIÓN DE CACHE DE PRECARGA ========================== */
// function cacheExpirada() está definida arriba

/* ========================== 8. ANÁLISIS AVANZADO Y REPORTES ========================== */
function mostrarUltimo() {
    const estadoEl = document.getElementById('estado');
    const resultsEl = document.getElementById('results');
    if (!estadoEl || !resultsEl) return;

    if (cacheExpirada() || !window.cacheData || !window.cacheData.rows || window.cacheData.rows.length === 0) {
      estadoEl.innerText = '⚠️ No hay datos o la precarga expiró.';
      resultsEl.innerHTML = '';
      return;
    }
    const { headers, rows } = window.cacheData;
    // Encontrar la columna de fecha principal, excluyendo las de anulación/devolución
    const idx = headers.findIndex(h => String(h).toLowerCase().includes('fecha') && 
                                   !String(h).toLowerCase().includes('anula') && 
                                   !String(h).toLowerCase().includes('devolu'));
    if (idx < 0) {
      estadoEl.innerText = '❌ No se encontró una columna de fecha principal adecuada.';
      return;
    }

    let latestEntry = null;
    let latestDate = null;

    rows.forEach(row => {
        const dateValue = row[idx];
        if (dateValue) {
            let currentDate = new Date(dateValue); // Intentar parsear
            if (dateValue instanceof Date && !isNaN(dateValue)) {
                currentDate = dateValue;
            } else if (typeof dateValue === 'string') {
                const parts = dateValue.match(/(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
                if (parts) {
                    currentDate = new Date(parseInt(parts[1]), parseInt(parts[2])-1, parseInt(parts[3]), parts[4]?parseInt(parts[4]):0, parts[5]?parseInt(parts[5]):0, parts[6]?parseInt(parts[6]):0);
                }
            }
            if (currentDate && !isNaN(currentDate.getTime())) {
                if (!latestDate || currentDate > latestDate) {
                    latestDate = currentDate;
                    latestEntry = row;
                }
            }
        }
    });
    
    if (!latestEntry) {
      estadoEl.innerText = '⚠️ No se encontraron fechas válidas en los datos.';
      return;
    }
    estadoEl.innerText = `🕒 Último pago (columna '${headers[idx]}'): ${ajustarYFormatear(latestEntry[idx])}`;
    
    const headersOrdenados = ordenarHeaders(headers);
    const idxsParaRender = headersOrdenados.map(h => headers.indexOf(h));
    renderizarTabla([latestEntry], headersOrdenados, idxsParaRender, headers);
}
  
function analizarAnulados() {
    const estadoEl = document.getElementById('estado');
    const resultsEl = document.getElementById('results');
    if (!estadoEl || !resultsEl) return;

    if (cacheExpirada() || !window.cacheData || !window.cacheData.rows || window.cacheData.rows.length === 0) {
      estadoEl.innerText = '⚠️ No hay datos o la precarga expiró.';
      resultsEl.innerHTML = '';
      return;
    }
    const { headers, rows } = window.cacheData;
    const idxEstado = headers.indexOf("Estado");
    const idxCanal  = headers.indexOf("Comercio"); 

    if (idxEstado === -1) {
        estadoEl.innerText = '❌ Columna "Estado" no encontrada para analizar anulados.';
        return;
    }
    if (idxCanal === -1) {
        console.warn('Columna "Comercio" no encontrada para agrupar anulados por canal. Se agrupará como "(Desconocido)".');
    }

    const resumen = {};
    rows.forEach(row => {
      if ((row[idxEstado] || "").toString().toLowerCase() === "anulado") {
        const canal = (idxCanal !== -1 && row[idxCanal]) ? row[idxCanal] : "(Desconocido)";
        resumen[canal] = (resumen[canal] || 0) + 1;
      }
    });
  
    let html = "<thead><tr><th>#</th><th>Canal (Comercio)</th><th>Total Anulados</th></tr></thead><tbody>";
    let i = 1;
    Object.entries(resumen)
      .sort(([, a], [, b]) => b - a)
      .forEach(([canal, total]) => {
        html += `<tr><td>${i++}</td><td>${canal}</td><td>${total}</td></tr>`;
      });
    html += "</tbody>";
    resultsEl.innerHTML = `<table>${html}</table>`;
    const totalAnulados = Object.values(resumen).reduce((sum, val) => sum + val, 0);
    estadoEl.innerText = `📑 Anulados encontrados: ${totalAnulados}`;
}
  
function analizarErrores() {
    const estadoEl = document.getElementById('estado');
    const resultsEl = document.getElementById('results');
    if (!estadoEl || !resultsEl) return;

    if (cacheExpirada() || !window.cacheData || !window.cacheData.rows || window.cacheData.rows.length === 0) {
      estadoEl.innerText = '⚠️ No hay datos o la precarga expiró.';
      resultsEl.innerHTML = '';
      return;
    }
    const { headers, rows } = window.cacheData;
    const estIdx  = headers.indexOf('Estado');
    const msgIdx  = headers.indexOf('Mensaje de respuesta');
    const comIdx  = headers.indexOf('Comercio');
    const authIdx = headers.indexOf('Autorizador');
  
    if (estIdx === -1 || msgIdx === -1 || comIdx === -1 || authIdx === -1) {
        let missingCols = ['Estado', 'Mensaje de respuesta', 'Comercio', 'Autorizador'].filter(c => headers.indexOf(c) === -1);
        estadoEl.innerText = `❌ Faltan columnas requeridas para analizar errores: ${missingCols.join(', ')}.`;
        return;
    }

    const errors = rows.filter(r => (r[estIdx] || '').toString().toLowerCase() === 'rechazado');
    const summary = {};
    errors.forEach(r => {
      const msg = r[msgIdx] || '(Sin mensaje)';
      const auth = r[authIdx] || '(Sin autorizador)';
      summary[msg] = summary[msg] || {};
      summary[msg][auth] = summary[msg][auth] || { total: 0, web: 0, app: 0 };
      summary[msg][auth].total++;
      const chan = (r[comIdx] || '').toString().toUpperCase();
      if (chan.includes('APP')) summary[msg][auth].app++;
      else summary[msg][auth].web++;
    });
  
    let html = `<thead><tr><th>#</th><th>Mensaje</th><th>Autorizador</th><th>Total</th><th>Web</th><th>App</th></tr></thead><tbody>`;
    let i = 1;
    Object.entries(summary).flatMap(([msg, auths]) =>
      Object.entries(auths).map(([auth, data]) => ({ msg, auth, ...data }))
    ).sort((a, b) => b.total - a.total)
      .forEach(entry => {
        html += `<tr><td>${i++}</td><td>${entry.msg}</td><td>${entry.auth}</td><td>${entry.total}</td><td>${entry.web}</td><td>${entry.app}</td></tr>`;
      });
    html += `</tbody>`;
    resultsEl.innerHTML = `<table>${html}</table>`;
    estadoEl.innerText = `📊 Rechazos: ${errors.length}`;
}
  
window.addEventListener('beforeunload', () => {
  // Considera si realmente quieres borrar window.cacheData aquí.
  // Si el usuario solo refresca la página, podría querer que la caché persista un poco.
  // Pero para una navegación fuera del sitio, sí es bueno.
  // window.cacheData = null; 
});

/* ========================== FIN DE INSPECTOR.JS ========================== */