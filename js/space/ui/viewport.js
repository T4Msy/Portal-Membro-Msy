// Teclado do celular: o iOS não encolhe a página quando o teclado abre, então
// o composer ficava escondido atrás dele. Aqui a altura do Space segue a área
// visível (visualViewport) e a página volta ao topo que o Safari tenta rolar.
export function followVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;
  const sync = () => {
    frame = 0;
    // Com pinça (zoom manual) a área visível encolhe sem teclado: não mexe.
    if (vv.scale > 1.01) { root.style.removeProperty('--sp-vvh'); return; }
    root.style.setProperty('--sp-vvh', `${Math.round(vv.height)}px`);
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  sync();
}
