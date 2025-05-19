// login/login.js
// Requiere que authService.js y login.css estén cargados antes

// Helper feedback colores (como sugerido antes)
function setMessage(msg, tipo = 'info') {
  const mensaje = document.getElementById('message'); // Asegúrate que el ID en login.html sea 'message'
  mensaje.textContent = msg || '';

  switch(tipo) {
    case 'success':
      // mensaje.style.color = rootStyles.getPropertyValue('--color-text-message-success').trim() || '#19e683';
      mensaje.style.color = 'var(--color-text-message-success, #4CAF50)'; // Usando var() directamente
      break;
    case 'error':
      // mensaje.style.color = rootStyles.getPropertyValue('--color-text-message-error').trim() || '#ffb300';
      mensaje.style.color = 'var(--color-text-message-error, #ffab40)';
      break;
    default: // info
      // mensaje.style.color = rootStyles.getPropertyValue('--color-text-message-info').trim() || '#b0b0b0';
      mensaje.style.color = 'var(--color-text-message-info, var(--color-on-surface-variant))';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm  = document.getElementById('login-form');
  const codeForm   = document.getElementById('code-form');
  const emailInput = document.getElementById('email');
  // Si tu input password se llama "password", cámbialo aquí:
  const passInput  = document.getElementById('password') || document.getElementById('pass');
  const codeInput  = document.getElementById('code');
  const btnLogin   = document.getElementById('btnLogin') || document.getElementById('btnEnviar');
  const btnVerificar = document.getElementById('btnVerificar');
  const btnReenviar  = document.getElementById('btnReenviar');

  // Lee redirect de la URL (si fue forzado desde otra sección protegida)
  const params   = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') || '/';

  // UX: Resetear mensajes
  function clearMessage() { setMessage("", 'info'); }

  // --- Paso 1: login email+pass ---
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();
    btnLogin.disabled = true;
    const email = emailInput.value.trim().toLowerCase();
    const pass  = passInput.value;

    setMessage('Enviando credenciales…', 'info');
    try {
      const res = await authLogin(email, pass);
      if (res.status !== 'ok') throw new Error(res.message);

      // Prepara el form de código: rellena y muestra debajo
      codeForm.dataset.email = email;
      codeForm.dataset.token = res.tmpToken;
      codeForm.style.display = 'block';
      codeInput.value = "";
      codeInput.focus();

      // Solo deshabilita inputs de login, no oculta nada
      emailInput.disabled = true;
      passInput.disabled = true;
      btnLogin.disabled = true;

      setMessage('Código enviado por mail. Revisa tu bandeja.', 'success');

    } catch (err) {
      setMessage(err.message || 'Error de login', 'error');
      btnLogin.disabled = false;
    }
  });

  // --- Paso 2: verificar código (2FA) ---
  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessage();
    btnVerificar.disabled = true;
    const email = codeForm.dataset.email;
    const token = codeForm.dataset.token;
    const code  = codeInput.value.trim();
    setMessage('Verificando código…', 'info');
    try {
      const res = await authVerifyCode(email, token, code);
      if (res.status !== 'ok') throw new Error(res.message);

      // Guardamos sesión global (localStorage)
      const session = {
        status:   'ok',
        email:    res.email,
        nombre:   res.nombre,
        rol:      res.rol,
        permisos: res.permisos,
        tmpToken: token
      };
      localStorage.setItem('session', JSON.stringify(session));
      localStorage.setItem('sessionTimestamp', Date.now().toString());

      setMessage('¡Login exitoso! Redirigiendo…', 'success');
      setTimeout(() => {
        window.location.href = redirect || "/";
      }, 700);

    } catch (err) {
      setMessage(err.message || 'Error de código', 'error');
      btnVerificar.disabled = false;
    }
  });

  // --- (Opcional) Botón reenviar código 2FA ---
  if (btnReenviar) {
    btnReenviar.addEventListener('click', async () => {
      btnReenviar.disabled = true;
      setMessage("Reenviando código...", "info");
      try {
        const email = codeForm.dataset.email;
        const pass = passInput.value;
        const res = await authLogin(email, pass);
        if (res.status !== 'ok') throw new Error(res.message);
        codeForm.dataset.token = res.tmpToken;
        setMessage("Nuevo código enviado. Revisa tu mail.", "success");
      } catch (err) {
        setMessage("No se pudo reenviar el código: " + (err.message || ""), "error");
      }
      btnReenviar.disabled = false;
    });
  }

  // Permite enviar con Enter en ambos forms
  emailInput.addEventListener('keydown', e => {
    if (e.key === "Enter") passInput.focus();
  });
  passInput.addEventListener('keydown', e => {
    if (e.key === "Enter") btnLogin.click();
  });
  codeInput.addEventListener('keydown', e => {
    if (e.key === "Enter") btnVerificar.click();
  });

  // Al cargar, enfoca el email
  emailInput.focus();
});
