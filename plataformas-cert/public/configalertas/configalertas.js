// public/configalertas/configuracionAlertas.js

const SCRIPT_URL_CONFIG_ALERTAS = 'https://script.google.com/macros/s/AKfycbzvCnlQRlKnhWUaz1z6TFj4sHMOdyvCoNCqfy_a1Zb3yzScIqrRy3MqO49z7DE1DsV0/exec'; // TU URL DE APPS SCRIPT

function appsScriptRequestConfig(action, params = {}, method = 'GET') {
    const sessionStr = localStorage.getItem('session');
    if (!sessionStr) {
        console.error('Sesión no encontrada en localStorage.');
        alert('Sesión no encontrada. Por favor, inicia sesión de nuevo.');
        return Promise.reject(new Error('Sesión no encontrada.'));
    }
    const session = JSON.parse(sessionStr);
    const requestParams = { action, token: session.tmpToken, email: session.email, ...params };

    if (method.toUpperCase() === 'GET') {
        const callbackName = 'jsonpCallbackConfig_' + Date.now() + Math.floor(Math.random() * 100000);
        const queryParams = new URLSearchParams(requestParams);
        return new Promise((resolve, reject) => {
            const scriptElement = document.createElement('script');
            window[callbackName] = (data) => {
                delete window[callbackName];
                document.body.removeChild(scriptElement);
                if (data.error) reject(new Error(data.error));
                else resolve(data);
            };
            scriptElement.src = `${SCRIPT_URL_CONFIG_ALERTAS}?${queryParams.toString()}&callback=${callbackName}`;
            scriptElement.onerror = () => {
                delete window[callbackName];
                document.body.removeChild(scriptElement);
                reject(new Error('Error de red (JSONP) al contactar config service.'));
            };
            document.body.appendChild(scriptElement);
        });
    } else if (method.toUpperCase() === 'POST') {
        return fetch(SCRIPT_URL_CONFIG_ALERTAS, {
            method: 'POST', mode: 'cors', cache: 'no-cache',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(requestParams)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success === false) throw new Error(data.message || "Operación falló en servidor.");
            return data;
        });
    }
    return Promise.reject(new Error(`Método ${method} no soportado.`));
}

let todasLasReglas = [];
let reglaModalElement, modalReglaTituloElement, formReglaElement,
    ruleRowNumberInput, ruleOriginalIndexInput, ruleAsuntoInput, ruleTipoCondicionSelect,
    valorCondicionContainer, valorCondicionInputArea, ruleValorCondicionSimpleInput,
    multiCondicionalInputsDiv, multiActivarInput, btnAddActivarKeyword, activarKeywordsListDiv,
    multiExcluirInput, btnAddExcluirKeyword, excluirKeywordsListDiv,
    ruleActivaSelect, ruleNotasTextarea,
    btnCancelarRegla, btnGuardarRegla, modalReglaCerrarBtnElement,
    valorCondicionHelpTextElement, infoTipoCondicionModalElement, modalInfoCerrarBtnElement;

function renderizarTarjetaRegla(regla, index) {
    const card = document.createElement('div');
    card.className = 'regla-item-card';
    card.dataset.ruleIndex = index;
    const asunto = regla.Asunto || 'N/A';
    const notas = regla.Notas || 'Sin notas.';
    const tipoCondicion = regla.TipoCondicion || 'N/A';
    const activa = String(regla.Activa).toLowerCase() === 'sí';
    card.innerHTML = `
        <h3 class="asunto-regla">${asunto}</h3>
        <p class="notas-regla" title="${notas}">${notas}</p>
        <div class="info-regla">
            <p><strong>Tipo:</strong> ${tipoCondicion}</p>
            <p><strong>Estado:</strong> <span class="activa-${activa ? 'si' : 'no'}">${activa ? 'Activa' : 'Inactiva'}</span></p>
        </div>
        <div class="regla-acciones">
            <button class="btn btn-secondary btn-small btn-editar-regla"><i class="ti ti-edit"></i> Editar</button>
            <button class="btn btn-danger btn-small btn-eliminar-regla"><i class="ti ti-trash"></i> Eliminar</button>
        </div>`;
    card.querySelector('.btn-editar-regla').addEventListener('click', () => abrirModalRegla(index));
    card.querySelector('.btn-eliminar-regla').addEventListener('click', () => confirmarEliminarRegla(index));
    return card;
}

async function cargarYMostrarConfiguracion() {
    const listaReglasContent = document.getElementById('lista-reglas-content');
    const loadingReglas = document.getElementById('loading-reglas');
    const noReglas = document.getElementById('no-reglas');
    const errorReglas = document.getElementById('error-reglas');
    if (loadingReglas) loadingReglas.classList.remove('hidden');
    if (noReglas) noReglas.classList.add('hidden');
    if (errorReglas) errorReglas.classList.add('hidden');
    if (listaReglasContent) listaReglasContent.innerHTML = '';
    try {
        const response = await appsScriptRequestConfig('getConfigData', {}, 'GET');
        if (loadingReglas) loadingReglas.classList.add('hidden');
        if (response && response.data && Array.isArray(response.data)) {
            todasLasReglas = response.data;
            if (todasLasReglas.length > 0) {
                todasLasReglas.forEach((regla, index) => {
                    if (listaReglasContent) listaReglasContent.appendChild(renderizarTarjetaRegla(regla, index));
                });
            } else {
                if (noReglas) noReglas.classList.remove('hidden');
            }
        } else { throw new Error(response.error || 'Respuesta inválida del servidor.'); }
    } catch (error) {
        console.error('Error al cargar config:', error);
        if (loadingReglas) loadingReglas.classList.add('hidden');
        if (errorReglas) { errorReglas.textContent = `Error: ${error.message}`; errorReglas.classList.remove('hidden'); }
    }
}

function inicializarModalRegla() {
    reglaModalElement = document.getElementById('reglaModal');
    modalReglaTituloElement = document.getElementById('modalReglaTitulo');
    formReglaElement = document.getElementById('formRegla');
    ruleRowNumberInput = document.getElementById('ruleRowNumber');
    ruleOriginalIndexInput = document.getElementById('ruleOriginalIndex');
    ruleAsuntoInput = document.getElementById('ruleAsunto');
    ruleTipoCondicionSelect = document.getElementById('ruleTipoCondicion');
    valorCondicionInputArea = document.getElementById('valorCondicionInputArea'); // Contenedor general
    ruleValorCondicionSimpleInput = document.getElementById('ruleValorCondicionSimple');
    multiCondicionalInputsDiv = document.getElementById('multiCondicionalInputs');
    multiActivarInput = document.getElementById('multiActivarInput');
    btnAddActivarKeyword = document.getElementById('btnAddActivarKeyword');
    activarKeywordsListDiv = document.getElementById('activarKeywordsList');
    multiExcluirInput = document.getElementById('multiExcluirInput');
    btnAddExcluirKeyword = document.getElementById('btnAddExcluirKeyword');
    excluirKeywordsListDiv = document.getElementById('excluirKeywordsList');
    ruleActivaSelect = document.getElementById('ruleActiva');
    ruleNotasTextarea = document.getElementById('ruleNotas');
    btnCancelarRegla = document.getElementById('btnCancelarRegla');
    btnGuardarRegla = document.getElementById('btnGuardarRegla');
    modalReglaCerrarBtnElement = document.getElementById('modalReglaCerrarBtn');
    valorCondicionHelpTextElement = document.getElementById('valorCondicionHelpText');
    infoTipoCondicionModalElement = document.getElementById('infoTipoCondicionModal');
    modalInfoCerrarBtnElement = document.getElementById('modalInfoCerrarBtn');
    const btnInfoTipoCondicion = document.getElementById('btnInfoTipoCondicion');

    if (!reglaModalElement || !formReglaElement) { console.error("Modal o form no encontrado."); return; }

    modalReglaCerrarBtnElement.addEventListener('click', cerrarModalRegla);
    btnCancelarRegla.addEventListener('click', cerrarModalRegla);
    reglaModalElement.addEventListener('click', (e) => { if (e.target === reglaModalElement) cerrarModalRegla(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !reglaModalElement.classList.contains('hidden')) cerrarModalRegla(); });
    if(btnInfoTipoCondicion && infoTipoCondicionModalElement) {
        btnInfoTipoCondicion.addEventListener('click', () => infoTipoCondicionModalElement.classList.remove('hidden'));
        modalInfoCerrarBtnElement.addEventListener('click', () => infoTipoCondicionModalElement.classList.add('hidden'));
        infoTipoCondicionModalElement.addEventListener('click', (e) => { if (e.target === infoTipoCondicionModalElement) infoTipoCondicionModalElement.classList.add('hidden'); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !infoTipoCondicionModalElement.classList.contains('hidden')) infoTipoCondicionModalElement.classList.add('hidden'); });
    }
    ruleTipoCondicionSelect.addEventListener('change', actualizarVisibilidadValorCondicion);
    btnAddActivarKeyword.addEventListener('click', () => anadirKeywordMulti(multiActivarInput, activarKeywordsListDiv));
    multiActivarInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); anadirKeywordMulti(multiActivarInput, activarKeywordsListDiv); }});
    btnAddExcluirKeyword.addEventListener('click', () => anadirKeywordMulti(multiExcluirInput, excluirKeywordsListDiv));
    multiExcluirInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); anadirKeywordMulti(multiExcluirInput, excluirKeywordsListDiv); }});
    formReglaElement.addEventListener('submit', guardarRegla);
}

function actualizarVisibilidadValorCondicion() {
    const tipo = ruleTipoCondicionSelect.value;
    multiCondicionalInputsDiv.classList.add('hidden');
    ruleValorCondicionSimpleInput.classList.add('hidden');
    ruleValorCondicionSimpleInput.disabled = true;
    valorCondicionHelpTextElement.textContent = "";
    if (tipo === "SiemprePositivo") {
        valorCondicionHelpTextElement.textContent = "No requiere 'Valor Condición'.";
    } else if (tipo === "PalabraClaveEnCuerpo" || tipo === "ExcluirSKU") {
        ruleValorCondicionSimpleInput.classList.remove('hidden');
        ruleValorCondicionSimpleInput.disabled = false;
        ruleValorCondicionSimpleInput.placeholder = "Valores separados por coma";
        valorCondicionHelpTextElement.textContent = "Valores separados por comas (ej: error,fallo).";
    } else if (tipo === "MultiCondicional") {
        multiCondicionalInputsDiv.classList.remove('hidden');
        valorCondicionHelpTextElement.textContent = "Añada palabras para activar y/o excluir.";
    }
}

function anadirKeywordMulti(inputElement, listDivElement) {
    const keyword = inputElement.value.trim();
    if (keyword) {
        const existingKeywords = Array.from(listDivElement.querySelectorAll('.keyword-tag > span')).map(span => span.textContent.trim().toLowerCase());
        if (!existingKeywords.includes(keyword.toLowerCase())) {
            const tag = document.createElement('span');
            tag.className = 'keyword-tag';
            tag.innerHTML = `<span>${keyword}</span> <i class="ti ti-x remove-keyword" title="Quitar"></i>`;
            tag.querySelector('.remove-keyword').addEventListener('click', (e) => e.target.closest('.keyword-tag').remove());
            listDivElement.appendChild(tag);
        }
        inputElement.value = "";
    }
    inputElement.focus();
}

function limpiarInputsMultiCondicional() {
    if(activarKeywordsListDiv) activarKeywordsListDiv.innerHTML = '';
    if(excluirKeywordsListDiv) excluirKeywordsListDiv.innerHTML = '';
    if(multiActivarInput) multiActivarInput.value = '';
    if(multiExcluirInput) multiExcluirInput.value = '';
}

function poblarModalParaMultiCondicional(valorCondicionObjeto) {
    limpiarInputsMultiCondicional();
    if (valorCondicionObjeto && Array.isArray(valorCondicionObjeto.activar)) {
        valorCondicionObjeto.activar.forEach(kw => {
            if (multiActivarInput) multiActivarInput.value = kw; 
            anadirKeywordMulti(multiActivarInput, activarKeywordsListDiv);
        });
    }
    if (valorCondicionObjeto && Array.isArray(valorCondicionObjeto.excluir)) {
        valorCondicionObjeto.excluir.forEach(kw => {
            if (multiExcluirInput) multiExcluirInput.value = kw; 
            anadirKeywordMulti(multiExcluirInput, excluirKeywordsListDiv);
        });
    }
}

function abrirModalRegla(ruleIndex = null) {
    if (!formReglaElement) { console.error("Form no init."); return; }
    formReglaElement.reset(); 
    limpiarInputsMultiCondicional();
    ruleTipoCondicionSelect.value = 'SiemprePositivo'; // Reset a un valor conocido
    actualizarVisibilidadValorCondicion(); 

    if (ruleIndex !== null && todasLasReglas[ruleIndex]) {
        const regla = todasLasReglas[ruleIndex];
        modalReglaTituloElement.textContent = "Editar Regla";
        ruleRowNumberInput.value = regla._rowNumber || ''; 
        ruleOriginalIndexInput.value = ruleIndex;
        ruleAsuntoInput.value = regla.Asunto || '';
        ruleTipoCondicionSelect.value = regla.TipoCondicion || 'SiemprePositivo';
        ruleActivaSelect.value = String(regla.Activa).toLowerCase() === 'sí' ? 'Sí' : 'No';
        ruleNotasTextarea.value = regla.Notas || '';
        actualizarVisibilidadValorCondicion(); // Ajustar inputs después de setear TipoCondicion
        if (regla.TipoCondicion === "MultiCondicional") {
            let vcObj = null;
            if (typeof regla.ValorCondicion === 'string' && regla.ValorCondicion.trim().startsWith('{')) {
                try { vcObj = JSON.parse(regla.ValorCondicion); } catch (e) { console.error("Error parseando VC JSON:", e); vcObj = { activar: [], excluir: [] }; }
            } else if (typeof regla.ValorCondicion === 'object' && regla.ValorCondicion !== null) { vcObj = regla.ValorCondicion; }
            else { vcObj = { activar: [], excluir: [] }; } // Fallback si no es string JSON ni objeto
            poblarModalParaMultiCondicional(vcObj);
        } else { 
            if (Array.isArray(regla.ValorCondicion)) {
                 ruleValorCondicionSimpleInput.value = regla.ValorCondicion.join(', ');
            } else { 
                 ruleValorCondicionSimpleInput.value = regla.ValorCondicion || '';
            }
        }
        btnGuardarRegla.textContent = "Guardar Cambios";
    } else {
        modalReglaTituloElement.textContent = "Añadir Nueva Regla";
        ruleRowNumberInput.value = ''; 
        ruleOriginalIndexInput.value = '';
        btnGuardarRegla.textContent = "Crear Regla";
    }
    reglaModalElement.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function cerrarModalRegla() {
    if (reglaModalElement) reglaModalElement.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

async function guardarRegla(event) {
    event.preventDefault(); 
    btnGuardarRegla.disabled = true;
    btnGuardarRegla.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Guardando...';
    const esNuevaRegla = !ruleRowNumberInput.value;
    const ruleData = {
        Asunto: ruleAsuntoInput.value.trim(),
        TipoCondicion: ruleTipoCondicionSelect.value,
        Activa: ruleActivaSelect.value,
        Notas: ruleNotasTextarea.value.trim(),
    };
    if (!esNuevaRegla) ruleData._rowNumber = parseInt(ruleRowNumberInput.value, 10);

    if (ruleData.TipoCondicion === "MultiCondicional") {
        const activarKws = Array.from(activarKeywordsListDiv.querySelectorAll('.keyword-tag > span')).map(span => span.textContent.trim().toLowerCase()).filter(kw => kw);
        const excluirKws = Array.from(excluirKeywordsListDiv.querySelectorAll('.keyword-tag > span')).map(span => span.textContent.trim().toLowerCase()).filter(kw => kw);
        ruleData.ValorCondicion = JSON.stringify({ activar: activarKws, excluir: excluirKws });
    } else if (ruleData.TipoCondicion === "PalabraClaveEnCuerpo" || ruleData.TipoCondicion === "ExcluirSKU") {
        ruleData.ValorCondicion = ruleValorCondicionSimpleInput.value.trim();
    } else { ruleData.ValorCondicion = ""; }

    const action = esNuevaRegla ? 'addConfigRule' : 'editConfigRule';
    try {
        const response = await appsScriptRequestConfig(action, { ruleData }, 'POST');
        alert(response.message || "Operación completada.");
        cerrarModalRegla();
        await cargarYMostrarConfiguracion(); 
    } catch (error) {
        console.error(`Error en ${action}:`, error);
        alert(`Error al guardar: ${error.message}`);
    } finally {
        btnGuardarRegla.disabled = false;
        btnGuardarRegla.innerHTML = esNuevaRegla ? "Crear Regla" : "Guardar Cambios";
    }
}

async function confirmarEliminarRegla(index) {
    if (index === undefined || !todasLasReglas[index] || !todasLasReglas[index]._rowNumber) {
        alert("Error: No se pudo identificar la regla a eliminar.");
        return;
    }
    const regla = todasLasReglas[index];
    if (confirm(`¿Estás seguro de que quieres eliminar la regla para el asunto "${regla.Asunto}"?`)) {
        const rowNumberToDelete = regla._rowNumber;
        // Deshabilitar botones de la tarjeta para evitar doble clic (opcional)
        const tarjetaRegla = document.querySelector(`.regla-item-card[data-rule-index="${index}"]`);
        if(tarjetaRegla) tarjetaRegla.querySelectorAll('button').forEach(b => b.disabled = true);

        try {
            const response = await appsScriptRequestConfig('deleteConfigRule', { rowNumber: rowNumberToDelete }, 'POST');
            if (response.success) {
                alert(response.message || "Regla eliminada.");
                await cargarYMostrarConfiguracion(); // Recargar la lista
            } else {
                throw new Error(response.message || "Error al eliminar la regla desde el servidor.");
            }
        } catch (error) {
            console.error('Error al eliminar regla:', error);
            alert(`Error al eliminar: ${error.message}`);
            if(tarjetaRegla) tarjetaRegla.querySelectorAll('button').forEach(b => b.disabled = false); // Reactivar botones
        }
    }
}

function initConfiguracionAlertas() {
  console.log('Inicializando página de Configuración de Alertas...');
  inicializarModalRegla(); 
  document.getElementById('btnAnadirNuevaRegla')?.addEventListener('click', () => abrirModalRegla());
  document.getElementById('btnRefrescarConfig')?.addEventListener('click', cargarYMostrarConfiguracion);
  cargarYMostrarConfiguracion(); 
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initConfiguracionAlertas();
} else {
    document.addEventListener('DOMContentLoaded', initConfiguracionAlertas);
}

async function saveConfigRule(payload) {
  const resp = await fetch(SCRIPT_URL_CONFIG_ALERTAS, {
    method: 'POST',
    mode: 'cors',  // <--- imprescindible para que el navegador permita la llamada
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data;
}

// Ejemplo de uso
document.getElementById('save-btn').addEventListener('click', async () => {
  try {
    const session = JSON.parse(localStorage.getItem('session'));
    const ruleData = {/* … recolectas desde tu formulario … */};
    const payload = {
      action: 'editConfigRule',
      email:   session.email,
      token:   session.tmpToken,
      ruleData
    };
    const result = await saveConfigRule(payload);
    if (result.success) {
      alert('Regla guardada correctamente');
      // refresca tu lista, cierra modal, etc.
    } else {
      alert('Error al guardar: ' + result.message);
    }
  } catch(err) {
    alert('Error al guardar: ' + err.message);
  }
});
async function appsScriptRequestConfig(payload) {
  const resp = await fetch(SCRIPT_URL_CONFIG_ALERTAS, {
    method: 'POST',
    mode:   'cors',                // ← Esto es *MANDATORIO*
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}