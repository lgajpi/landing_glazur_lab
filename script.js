/* ============ NAV shadow on scroll ============ */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

/* ============ Reveal on scroll ============ */
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      revealIO.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 90}ms`;
  revealIO.observe(el);
});

/* ============ Birth animation ============ */
const scene = document.getElementById('scene');
const caption = document.getElementById('sceneCaption');
const bar = document.getElementById('birthBar');
const stepEls = document.querySelectorAll('.birth__steps li');

const phases = [
  { cls: 'is-wire',   label: 'Каркас из проволоки' },
  { cls: 'is-petals', label: 'Формируем лепестки' },
  { cls: 'is-dip',    label: 'Погружение в состав' },
  { cls: 'is-uv',     label: 'УФ закаляет глину' },
  { cls: 'is-paint',  label: 'Ручная роспись' },
];
const PHASE_MS = 2600;
let phaseIdx = -1;
let birthTimer = null;

function setPhase(i) {
  phaseIdx = i;
  scene.classList.remove(...phases.map((p) => p.cls));
  scene.classList.add(phases[i].cls);
  caption.textContent = phases[i].label;
  bar.style.width = `${((i + 1) / phases.length) * 100}%`;
  stepEls.forEach((el) => el.classList.toggle('active', +el.dataset.step === i));
}

function tickBirth() {
  setPhase((phaseIdx + 1) % phases.length);
}

function startBirth() {
  if (birthTimer) return;
  setPhase(0);
  birthTimer = setInterval(tickBirth, PHASE_MS);
}
function stopBirth() {
  clearInterval(birthTimer);
  birthTimer = null;
}

// only run the animation while the section is visible
const birthIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => (e.isIntersecting ? startBirth() : stopBirth()));
}, { threshold: 0.3 });
birthIO.observe(document.getElementById('birth'));

// let users jump to a step by clicking it
stepEls.forEach((el) => {
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => {
    stopBirth();
    setPhase(+el.dataset.step);
    birthTimer = setInterval(tickBirth, PHASE_MS);
  });
});

/* ============ Works carousel ============ */
const flowers = [
  {
    name: 'Красная роза',
    file: 'красная роза.jpg',
    desc: 'Глянцевый бордо с золотой каймой лепестков.',
    price: null,
    grad: ['#4a0a12', '#8f1424', '#c8324a'],
    dark: true,
  },
  {
    name: 'Сирень',
    file: 'фиолетовая сирень.jpg',
    desc: 'Лавандовые грозди в фарфоровой вазе.',
    price: null,
    grad: ['#5a3f7a', '#9b7bc4', '#dcbede'],
    dark: true,
  },
  {
    name: 'Голубая гортензия',
    file: 'голыбая гортензия метельчатая.jpg',
    desc: 'Дымчатое стекло и золотая проволока.',
    price: null,
    grad: ['#2e4a54', '#5d8794', '#b6cbce'],
    dark: true,
  },
  {
    name: 'Розовая гортензия',
    file: 'букет из метельчатой гортензии и кропнолистной цвет розовый и голубой.jpg',
    desc: 'Малиновые соцветия с золотыми листьями.',
    price: null,
    grad: ['#7a1a52', '#c23f8a', '#eeb6d2'],
    dark: true,
  },
  {
    name: 'Космеи',
    file: 'красные и белые космеи с золотистой проволкой и сердцевиной.jpg',
    desc: 'Алые и кремовые с золотой сердцевиной.',
    price: null,
    grad: ['#6e1420', '#b8384a', '#e6c49c'],
    dark: true,
  },
  {
    name: 'Белая лилия',
    file: 'белая лилия.jpg',
    desc: 'Прозрачные лепестки с янтарными тычинками.',
    price: null,
    grad: ['#b8ad98', '#ddd0bb', '#f7f1e6'],
    dark: false,
  },
  {
    name: 'Большие подснежники',
    file: 'большие белые подснежники.jpg',
    desc: 'Серебристо-прозрачные первоцветы.',
    price: null,
    grad: ['#7d8894', '#bcc6cf', '#eaeef1'],
    dark: false,
  },
  {
    name: 'Мелкие подснежники',
    file: 'маленькие белые подснежники.jpg',
    desc: 'Миниатюрные цветы на оливковых стеблях.',
    price: null,
    grad: ['#6f7256', '#a8a684', '#e6e3d2'],
    dark: false,
  },
  {
    name: 'Ромашки',
    file: 'букет в вазе из ромашек2.jpg',
    desc: 'Стеклянные лепестки, янтарные серединки.',
    price: null,
    grad: ['#a98c4e', '#d6c084', '#f2eace'],
    dark: false,
  },
];

// jewelry from the "Украшения" block — also orderable in the form
const jewelry = [
  { name: 'Брошь из гортензии', file: 'голубая брошка из соцветий гортензии.jpg', price: null },
  { name: 'Серьги-цветок', file: 'серебристая сережка цветочек.jpg', price: null },
];

// price shown here when a specific price isn't set yet
const PRICE_FALLBACK = 'Цена по запросу';
// how long the work is shown before its price gently appears (ms)
const PRICE_DELAY = 2200;
let priceTimer = null;

const track = document.getElementById('track');
const dotsWrap = document.getElementById('dots');
const worksBg = document.getElementById('worksBg');
const worksSection = document.getElementById('works');
let current = 0;

// two stacked layers so gradients cross-fade instead of snapping
const bgA = document.createElement('div');
const bgB = document.createElement('div');
bgA.className = 'works__bg-layer';
bgB.className = 'works__bg-layer';
worksBg.append(bgA, bgB);
let bgFront = bgA;

// build slides + dots
flowers.forEach((f, i) => {
  const slide = document.createElement('article');
  slide.className = 'slide';
  slide.style.backgroundImage = `url("images/${f.file}")`;
  slide.innerHTML = `
    <div class="slide__body">
      <h3>${f.name}</h3>
      <p>${f.desc}</p>
      <span class="slide__price">${f.price || PRICE_FALLBACK}</span>
    </div>`;
  track.appendChild(slide);

  const dot = document.createElement('button');
  dot.setAttribute('aria-label', f.name);
  dot.addEventListener('click', () => goTo(i));
  dotsWrap.appendChild(dot);
});

const slides = [...track.children];
const dots = [...dotsWrap.children];

function render() {
  const n = flowers.length;
  slides.forEach((s, i) => {
    s.className = 'slide';
    if (i === current) s.classList.add('is-active');
    else if (i === (current - 1 + n) % n) s.classList.add('is-prev');
    else if (i === (current + 1) % n) s.classList.add('is-next');
    else s.classList.add('is-hidden');
  });
  dots.forEach((d, i) => d.classList.toggle('on', i === current));

  const f = flowers[current];
  const grad = `radial-gradient(130% 90% at 50% 12%, ${f.grad[2]}, ${f.grad[1]} 42%, ${f.grad[0]})`;
  const back = bgFront === bgA ? bgB : bgA;
  back.style.background = grad;
  back.style.opacity = '1';
  bgFront.style.opacity = '0';
  bgFront = back;
  worksSection.classList.toggle('dark', f.dark);

  // two-stage: let the work be seen clean first, then reveal caption + price together
  clearTimeout(priceTimer);
  slides.forEach((s) => s.classList.remove('price-shown'));
  priceTimer = setTimeout(() => slides[current].classList.add('price-shown'), PRICE_DELAY);
}

function goTo(i) {
  current = (i + flowers.length) % flowers.length;
  render();
}
const next = () => goTo(current + 1);
const prev = () => goTo(current - 1);

document.getElementById('nextBtn').addEventListener('click', next);
document.getElementById('prevBtn').addEventListener('click', prev);

// keyboard
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft') prev();
});

// touch swipe
let touchX = null;
track.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
track.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 44) (dx < 0 ? next() : prev());
  touchX = null;
});

// autoplay (pause on hover / when tab hidden)
let auto = setInterval(next, 6500);
const carousel = document.getElementById('carousel');
carousel.addEventListener('mouseenter', () => clearInterval(auto));
carousel.addEventListener('mouseleave', () => (auto = setInterval(next, 6500)));

render();

/* ============ Order form ============ */
const form = document.getElementById('orderForm');
const note = document.getElementById('formNote');

/* ---- custom "что хотите заказать" dropdown with a floating image popup ---- */
const wselWrap = document.getElementById('wsel');
const wselBtn = document.getElementById('wselBtn');
const wselText = document.getElementById('wselText');
const wselList = document.getElementById('wselList');
const wishValue = document.getElementById('wishValue');
const WSEL_PLACEHOLDER = 'Выберите работу…';

const optionLabel = (it) => (it.price ? `${it.name} — ${it.price}` : it.name);

// floating preview popup — lives on <body> so it floats above everything
const pop = document.createElement('div');
pop.className = 'wsel__pop';
pop.innerHTML = '<div class="wsel__pop-img"></div><div class="wsel__pop-name"></div>';
document.body.appendChild(pop);
const popImg = pop.querySelector('.wsel__pop-img');
const popName = pop.querySelector('.wsel__pop-name');

const hidePop = () => pop.classList.remove('show');
const showPop = (it, anchor) => {
  if (!it.file) { hidePop(); return; }
  popImg.style.backgroundImage = `url("images/${it.file}")`;
  popName.textContent = optionLabel(it);
  pop.classList.add('show');
  // position centered above the hovered option, flip below if no room
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const ph = pop.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = r.top - ph - 12;
  if (top < 8) top = r.bottom + 12;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
};

const openWsel = () => { wselWrap.classList.add('open'); wselBtn.setAttribute('aria-expanded', 'true'); };
const closeWsel = () => { wselWrap.classList.remove('open'); wselBtn.setAttribute('aria-expanded', 'false'); hidePop(); };
const resetWsel = () => {
  wishValue.value = '';
  wselText.textContent = WSEL_PLACEHOLDER;
  wselText.classList.remove('picked');
  closeWsel();
};

const addItem = (it) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'wsel__opt';
  b.setAttribute('role', 'option');
  b.dataset.name = it.name;
  b.textContent = it.label || optionLabel(it);
  b.addEventListener('mouseenter', () => showPop(it, b));
  b.addEventListener('focus', () => showPop(it, b));
  b.addEventListener('mouseleave', hidePop);
  b.addEventListener('blur', hidePop);
  b.addEventListener('click', () => {
    wishValue.value = it.name;
    wselText.textContent = it.name;
    wselText.classList.add('picked');
    closeWsel();
  });
  wselList.appendChild(b);
};

const addGroupLabel = (label) => {
  const g = document.createElement('div');
  g.className = 'wsel__group';
  g.textContent = label;
  wselList.appendChild(g);
};

addGroupLabel('Цветы');
flowers.forEach(addItem);
addGroupLabel('Украшения');
jewelry.forEach(addItem);
addItem({ name: 'Другое', label: 'Другое / свой вариант' });

// keep the popup glued to its item while the list scrolls
wselList.addEventListener('scroll', hidePop);
wselBtn.addEventListener('click', () => (wselWrap.classList.contains('open') ? closeWsel() : openWsel()));
document.addEventListener('click', (e) => { if (!wselWrap.contains(e.target)) closeWsel(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWsel(); });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = form.name;
  const contact = form.contact;
  let ok = true;
  [name, contact].forEach((el) => {
    const bad = !el.value.trim();
    el.classList.toggle('err', bad);
    if (bad) ok = false;
  });
  if (!ok) {
    note.textContent = 'Заполните имя и контакт — так я смогу ответить.';
    note.classList.remove('ok');
    return;
  }
  note.textContent = 'Спасибо! Заявка принята — свяжусь с вами в течение дня ✿';
  note.classList.add('ok');
  form.reset();
  resetWsel();
});
