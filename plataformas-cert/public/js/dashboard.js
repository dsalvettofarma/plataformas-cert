// UI del dashboard
window.addEventListener('DOMContentLoaded', ()=>{
  const sess = JSON.parse(sessionStorage.getItem('session')||'null');
  if (!sess) return window.location='login.html';
  const container = document.getElementById('sections');
  sess.permisos.forEach(sec=>{
    const d = document.createElement('div'); d.textContent = sec;
    container.appendChild(d);
  });
});