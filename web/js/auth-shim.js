// Minimal stubs for auth-only pages after legacy dashboard JS was archived.
window.updateTopBarProfile = function () {};
function showToast(type, title, message) {
  var text = (title || '') + (message ? ': ' + message : '');
  if (type === 'error') {
    console.error(text);
    if (typeof window.alert === 'function') window.alert(text);
    return;
  }
  console.log(type, text);
}
