// shared/authService.js

const API_URL = 'https://script.google.com/macros/s/AKfycbztOT5ajxaBMJ3eFnpja-TSsNjO6tS60RRO9N5zZ3aiSlezMEdFUpSj_idAZe7NTMDP2A/exec';

/**
 * JSONP helper: inyecta un <script> y espera el callback.
 */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'cb_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    window[callbackName] = data => {
      delete window[callbackName];
      document.body.removeChild(script);
      resolve(data);
    };
    const script = document.createElement('script');
    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
    script.onerror = () => {
      delete window[callbackName];
      document.body.removeChild(script);
      reject(new Error('Network error'));
    };
    document.body.appendChild(script);
  });
}

async function authLogin(email, pass) {
  const qs = `action=login&email=${encodeURIComponent(email)}&pass=${encodeURIComponent(pass)}`;
  const data = await jsonp(API_URL + '?' + qs);
  if (data.status !== 'ok') throw new Error(data.message);
  return data;
}

async function authVerifyCode(email, token, code) {
  const qs = [
    `action=verify-code`,
    `email=${encodeURIComponent(email)}`,
    `token=${encodeURIComponent(token)}`,
    `code=${encodeURIComponent(code)}`
  ].join('&');
  const data = await jsonp(API_URL + '?' + qs);
  if (data.status !== 'ok') throw new Error(data.message);
  return data;
}

/**
 * Valida que la sesión exista y no haya expirado.
 * Si es inválida, redirige automáticamente al login.
 */
function requireSession(perms = [], redirectPath = '/login.html') {
  const sessionStr = localStorage.getItem('session');
  const tsStr = localStorage.getItem('sessionTimestamp');
  if (!sessionStr || !tsStr) {
    window.location.href = redirectPath;
    return null;
  }
  const ts = parseInt(tsStr, 10);
  if (Date.now() - ts > 3600000) { // 1 hora
    localStorage.clear();
    window.location.href = redirectPath;
    return null;
  }
  const session = JSON.parse(sessionStr);
  if (!session.status || session.status !== 'ok') {
    window.location.href = redirectPath;
    return null;
  }
  if (perms.length && !perms.some(p => session.permisos.includes(p))) {
    document.body.innerHTML = `<h2>🛑 Acceso denegado</h2><p>No tienes permiso para ver esta sección.</p>`;
    return null;
  }
  return session;
}

window.authLogin = authLogin;
window.authVerifyCode = authVerifyCode;
window.requireSession = requireSession;
