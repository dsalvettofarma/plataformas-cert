// js/authService.js

const API_URL = 'https://script.google.com/macros/s/AKfycbztOT5ajxaBMJ3eFnpja-TSsNjO6tS60RRO9N5zZ3aiSlezMEdFUpSj_idAZe7NTMDP2A/exec';

/**
 * JSONP helper: inyecta un <script> y espera el callback.
 */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'cb_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    // Definir la función global
    window[callbackName] = data => {
      delete window[callbackName];
      document.body.removeChild(script);
      resolve(data);
    };
    // Crear y añadir <script>
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
