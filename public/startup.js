const root = document.querySelector('#app');
function showStartupError() {
  if (!root.querySelector('.loading[aria-busy="true"]')) return;
  const main = document.createElement('main');
  main.className = 'loading';
  const title = document.createElement('h1');
  title.textContent = '页面暂时无法打开';
  const message = document.createElement('p');
  message.textContent = '页面资源未能加载完成，请重新加载后再试。';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'primary';
  retry.textContent = '重新加载';
  retry.addEventListener('click', () => location.reload());
  main.append(title, message, retry);
  root.replaceChildren(main);
}
const timer = setTimeout(showStartupError, 20000);
try {
  await import('./app.js');
} catch (error) {
  console.error('Application startup failed:', error);
  showStartupError();
} finally {
  clearTimeout(timer);
}
