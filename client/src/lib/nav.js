// Navegação sem recarregar (registrada pelo roteador em main.js).
export function navigate(to, opts) {
  if (window.__navigate) window.__navigate(to, opts);
  else location.href = to;
}
