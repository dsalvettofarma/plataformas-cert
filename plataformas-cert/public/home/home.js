// public/home/home.js
console.log("Página de bienvenida (home.js) cargada e inicializando.");

function displayCurrentDate() {
  const dateElement = document.getElementById('current-date-display');
  if (dateElement) {
    const now = new Date();
    // Formato de fecha para Uruguay, incluyendo día de la semana
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        // hour: '2-digit', // Puedes añadir la hora si quieres
        // minute: '2-digit',
        timeZone: 'America/Montevideo' // Asegurar la zona horaria correcta
    };
    
    let formattedDate;
    try {
        // es-UY podría no estar soportado en todos los navegadores para toLocaleDateString con todas las options.
        // es-ES es un fallback más común.
        formattedDate = now.toLocaleDateString('es-ES', options); 
    } catch (e) {
        console.warn("toLocaleDateString con 'es-UY' u 'es-ES' falló, usando formato por defecto.", e);
        // Fallback a un formato más genérico si hay problemas
        const fallbackOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        formattedDate = now.toLocaleDateString(undefined, fallbackOptions);
    }
    // Capitalizar la primera letra del resultado
    dateElement.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
    console.log("Fecha actual mostrada:", formattedDate);
  } else {
    console.warn("Elemento #current-date-display no encontrado en home.html.");
  }
}

// El script se carga después de que el HTML de la sección 'home' se inserta en el DOM.
// Por lo tanto, los elementos deberían estar disponibles.
// Si usas `defer` en el script tag que carga home.js (lo cual main.js no hace explícitamente
// para scripts de sección), DOMContentLoaded sería más robusto, pero para carga directa así,
// ejecutarlo directamente suele funcionar.
// Para mayor seguridad, puedes envolverlo:
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', displayCurrentDate);
} else {
    // DOM ya está listo o interactivo
    displayCurrentDate();
}

// Aquí no hay lógica para botones de tarjetas, ya que las eliminamos para
// no depender de los permisos/roles en esta página de bienvenida.