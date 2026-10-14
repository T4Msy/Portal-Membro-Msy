// Teclado do celular: o iOS não encolhe a página quando o teclado abre, então
// o composer ficava escondido atrás dele. Aqui a altura do Space segue a área
// visível (visualViewport) e a página volta ao topo que o Safari tenta rolar.
//
// O iOS só avisa o tamanho novo depois que a animação do teclado termina.
// Para não esperar por isso, a altura do teclado fica guardada: ao tocar num
// campo, o Space já encolhe na hora, e ao sair dele já volta ao tamanho cheio.
const KEYBOARD_KEY = 'msy_space_keyboard_h';
const MIN_KEYBOARD = 120; // menos que isso é barra do navegador, não teclado

const isEditable = (el) => Boolean(el?.matches?.('textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), [contenteditable="true"]'));

function readKeyboard() {
  try { return Number(localStorage.getItem(KEYBOARD_KEY)) || 0; } catch { return 0; }
}

function saveKeyboard(px) {
  try { localStorage.setItem(KEYBOARD_KEY, String(px)); } catch {}
}

export function followVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const layoutHeight = () => root.clientHeight;
  const setHeight = (px) => {
    root.style.setProperty('--sp-vvh', `${Math.round(px)}px`);
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };

  let frame = 0;
  const sync = () => {
    frame = 0;
    // Com pinça (zoom manual) a área visível encolhe sem teclado: não mexe.
    if (vv.scale > 1.01) { root.style.removeProperty('--sp-vvh'); return; }
    const keyboard = layoutHeight() - vv.height;
    if (keyboard > MIN_KEYBOARD) saveKeyboard(keyboard);
    setHeight(vv.height);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);

  if (matchMedia('(pointer: coarse)').matches) {
    document.addEventListener('focusin', (e) => {
      if (!isEditable(e.target) || vv.scale > 1.01) return;
      const keyboard = readKeyboard();
      if (keyboard > MIN_KEYBOARD) setHeight(layoutHeight() - keyboard);
    });
    document.addEventListener('focusout', () => {
      // Espera o foco pousar: indo de um campo para outro o teclado continua aberto.
      setTimeout(() => {
        if (!isEditable(document.activeElement) && vv.scale <= 1.01) setHeight(layoutHeight());
      }, 0);
    });
  }
  sync();
}
