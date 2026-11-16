/**
 * Application bootstrap — loaded by every page:
 *   <body data-page="dashboard"> … <script type="module" src="/js/app.js"></script>
 * Renders the shared header/footer, sets up offline detection and anonymous
 * page-view tracking, then loads the page module named in data-page.
 */
import { initNavigation } from './navigation.js';
import { renderFooter } from '../components/footer.js';
import { api } from './api.js';
import { icons } from './icons.js';
import { renderErrorState, toast } from './ui.js';

const PAGES = {
  home: () => import('./home.js'),
  login: () => import('./account.js').then((m) => ({ init: m.initLogin })),
  register: () => import('./account.js').then((m) => ({ init: m.initRegister })),
  profile: () => import('./account.js').then((m) => ({ init: m.initProfile })),
  'medical-history': () => import('./medical-history.js'),
  'vision-test': () => import('./vision-test.js'),
  scan: () => import('./camera.js'),
  analyze: () => import('./analyze.js'),
  result: () => import('./ai-result.js'),
  history: () => import('./history.js'),
  patients: () => import('./patients.js'),
  dashboard: () => import('./dashboard.js'),
  guide: () => import('./guide.js'),
  admin: () => import('./admin.js'),
  static: () => Promise.resolve({ init: () => {} }),
};

function offlineBanner() {
  let el = null;
  const update = () => {
    if (!navigator.onLine && !el) {
      el = document.createElement('div');
      el.className = 'offline-banner';
      el.setAttribute('role', 'alert');
      el.innerHTML = `${icons.wifiOff.replace('<svg', '<svg width="18" height="18" style="display:inline;vertical-align:-3px;margin-right:6px"')}ไม่มีการเชื่อมต่ออินเทอร์เน็ต ข้อมูลจะไม่ถูกบันทึกจนกว่าจะเชื่อมต่อได้`;
      document.body.prepend(el);
    } else if (navigator.onLine && el) {
      el.remove();
      el = null;
      toast('เชื่อมต่ออินเทอร์เน็ตแล้ว', 'success', 2500);
    }
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function track(event) {
  // Anonymous, non-identifying page analytics (see privacy policy)
  api.post('/activity/track', { event, path: location.pathname }, { keepalive: true, timeout: 5000 }).catch(() => {});
}

async function boot() {
  offlineBanner();
  renderFooter();
  await initNavigation();
  track('page_view');
  window.addEventListener('pagehide', () => track('page_leave'), { once: true });
  window.addEventListener('auth:expired', () => {
    if (document.body.dataset.public !== 'true') toast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'warning');
  });

  const page = document.body.dataset.page;
  const loader = PAGES[page];
  if (!loader) return;
  const main = document.getElementById('page-root') ?? document.getElementById('main');
  try {
    const mod = await loader();
    await mod.init?.();
  } catch (err) {
    console.error(err);
    if (main) renderErrorState(main, err, () => location.reload());
  }
}

boot();
