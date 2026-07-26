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
const PHASE_MS = 1400;
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
    name: 'Роза',
    file: 'красная роза.jpg',
    desc: 'Глянцевый бордо с золотой каймой лепестков.',
    price: '5 900 ₽',
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
    name: 'Гортензия метельчатая',
    file: 'голыбая гортензия метельчатая.jpg',
    desc: 'Дымчатое стекло и золотая проволока.',
    price: '3 900 ₽',
    grad: ['#2e4a54', '#5d8794', '#b6cbce'],
    dark: true,
  },
  {
    name: 'Гортензия крупнолистная',
    file: 'букет из метельчатой гортензии и кропнолистной цвет розовый и голубой.jpg',
    desc: 'Малиновые соцветия с золотыми листьями.',
    price: '4 900 ₽',
    grad: ['#7a1a52', '#c23f8a', '#eeb6d2'],
    dark: true,
  },
  {
    name: 'Космея',
    file: 'красные и белые космеи с золотистой проволкой и сердцевиной.jpg',
    desc: 'Алые и кремовые с золотой сердцевиной.',
    price: '8 000 ₽',
    grad: ['#6e1420', '#b8384a', '#e6c49c'],
    dark: true,
  },
  {
    name: 'Лилия',
    file: 'белая лилия.jpg',
    desc: 'Прозрачные лепестки с янтарными тычинками.',
    price: '1 900 ₽',
    grad: ['#b8ad98', '#ddd0bb', '#f7f1e6'],
    dark: false,
  },
  {
    name: 'Подснежник большой',
    file: 'большие белые подснежники.jpg',
    desc: 'Серебристо-прозрачные первоцветы.',
    price: '6 500 ₽',
    grad: ['#7d8894', '#bcc6cf', '#eaeef1'],
    dark: false,
  },
  {
    name: 'Подснежник мини',
    file: 'маленькие белые подснежники.jpg',
    desc: 'Миниатюрные цветы на оливковых стеблях.',
    price: '2 900 ₽',
    grad: ['#6f7256', '#a8a684', '#e6e3d2'],
    dark: false,
  },
  {
    name: 'Карамельные ромашки',
    file: 'букет в вазе из ромашек2.jpg',
    desc: 'Стеклянные лепестки, янтарные серединки.',
    price: '4 900 ₽',
    grad: ['#a98c4e', '#d6c084', '#f2eace'],
    dark: false,
  },
];

// jewelry from the "Украшения" block — also orderable in the form
const jewelry = [
  { name: 'Брошь', file: 'голубая брошка из соцветий гортензии.jpg', price: '1 500 ₽' },
  { name: 'Серьги', file: 'серебристая сережка цветочек.jpg', price: '1 900 ₽' },
];

// price shown here when a specific price isn't set yet
const PRICE_FALLBACK = 'Цена по запросу';
// price and caption appear almost immediately on each slide
const PRICE_DELAY = 120;
let priceTimer = null;

const track = document.getElementById('track');
const dotsWrap = document.getElementById('dots');
const worksBg = document.getElementById('worksBg');
const worksSection = document.getElementById('catalog-flowers');
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
  slide.setAttribute('role', 'img');
  slide.setAttribute('aria-label', `${f.name}. ${f.desc}`);
  slide.innerHTML = `
    <div class="slide__body">
      <h3>${f.name}</h3>
      <p>${f.desc}</p>
      <span class="slide__price">${f.price || PRICE_FALLBACK}</span>
    </div>`;
  track.appendChild(slide);

  const dot = document.createElement('button');
  dot.setAttribute('aria-label', `Слайд: ${f.name}`);
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
let auto = setInterval(next, 3000);
const carousel = document.getElementById('carousel');
carousel.addEventListener('mouseenter', () => clearInterval(auto));
carousel.addEventListener('mouseleave', () => (auto = setInterval(next, 3000)));

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

// Куда шлём заявку. За Caddy (локально и в проде) фронт и /api — один origin,
// поэтому путь относительный: /api/order → Caddy проксирует на Go-бэк.
// Если открыть index.html напрямую через file:// — стучимся прямо в бэк на 8085.
const ORDER_ENDPOINT = location.protocol === 'file:'
  ? 'http://localhost:8085/api/order'
  : '/api/order';
const submitBtn = form.querySelector('button[type="submit"]');
const nameEl = document.getElementById('name');
const contactEl = document.getElementById('contact');

// Нормализует телефон РФ к виду +7XXXXXXXXXX. Возвращает null, если это не номер.
const normalizeRuPhone = (raw) => {
  let d = (raw || '').replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = '7' + d.slice(1);
  else if (d.length === 10) d = '7' + d;
  else return null;
  return d.length === 11 && d[0] === '7' ? '+' + d : null;
};

/* ---- live-маска телефона: авто +7, без дублей, ограничение по длине РФ ---- */
// Форматирует ввод в +7 (XXX) XXX-XX-XX. Что бы человек ни начал вводить
// (8, 7, +7, сразу код 9xx) — приводим к единому виду и режем до 11 цифр.
const formatRuPhone = (raw) => {
  let d = (raw || '').replace(/\D/g, '');
  if (d[0] === '8') d = '7' + d.slice(1);      // 8… → 7…
  else if (d && d[0] !== '7') d = '7' + d;      // код без 7/8 (напр. 9xx) → добавляем 7
  d = d.slice(0, 11);                           // РФ: 7 + 10 цифр
  const n = d.slice(1);                          // «национальная» часть, до 10 цифр
  let out = '+7';
  if (n.length > 0) out += ' (' + n.slice(0, 3);
  if (n.length > 3) out += ') ' + n.slice(3, 6);
  if (n.length > 6) out += '-' + n.slice(6, 8);
  if (n.length > 8) out += '-' + n.slice(8, 10);
  return out;
};

// Показываем +7 при первом фокусе, если поле пустое.
contactEl.addEventListener('focus', () => {
  if (!contactEl.value.trim()) contactEl.value = '+7 ';
});
// Форматируем на каждый ввод/вставку, каретку держим в конце.
contactEl.addEventListener('input', () => {
  contactEl.value = formatRuPhone(contactEl.value);
  contactEl.classList.remove('err');
});
// Если ушли с пустого/«голого» +7 — очищаем, чтобы плейсхолдер вернулся.
contactEl.addEventListener('blur', () => {
  if (contactEl.value.replace(/\D/g, '') === '7') contactEl.value = '';
});

const setNote = (text, ok) => {
  note.textContent = text;
  note.classList.toggle('ok', !!ok);
  note.classList.toggle('bad', !ok);
};

/* ---- Yandex SmartCaptcha (видимая, чекбокс «Я не робот») ---- */
// Клиентский ключ капчи — публичный, берётся в Yandex Cloud → SmartCaptcha.
// Замените на свой ysc1_... Серверный (secret) живёт только в .env бэкенда.
const SMARTCAPTCHA_SITEKEY = 'ysc1_5uP9m9xMcSINegOhzefzcrdS73QlOiNjcBVUY0hK6bf49214';
let captchaWidgetId = null;
let captchaToken = ''; // токен появляется, когда человек прошёл чекбокс

const resetSubmit = () => {
  submitBtn.textContent = 'Отправить заявку';
  submitBtn.disabled = false;
};

// Вызывается скриптом капчи после загрузки (?onload=onloadSmartCaptcha).
window.onloadSmartCaptcha = () => {
  if (!window.smartCaptcha) return;
  captchaWidgetId = window.smartCaptcha.render('captcha-container', {
    sitekey: SMARTCAPTCHA_SITEKEY,
    hl: 'ru',
    // видимый режим (invisible не указываем): рисуется чекбокс в форме
    callback: (token) => { captchaToken = token; }, // прошли проверку
  });
  // токен одноразовый/истекает — сбрасываем, чтобы требовать заново
  try {
    window.smartCaptcha.subscribe(captchaWidgetId, 'token-expired', () => { captchaToken = ''; });
    window.smartCaptcha.subscribe(captchaWidgetId, 'network-error', () => { captchaToken = ''; });
  } catch (_) { /* не критично */ }
};

// Проверяет поля формы, подсвечивает ошибки. Возвращает нормализованный
// телефон или null, если что-то не так (и показывает сообщение).
const validateForm = () => {
  const nameBad = !nameEl.value.trim();
  nameEl.classList.toggle('err', nameBad);

  const phone = normalizeRuPhone(contactEl.value);
  const phoneBad = phone === null;
  contactEl.classList.toggle('err', phoneBad);

  const wishBad = !wishValue.value.trim();
  wselWrap.classList.toggle('err', wishBad);

  if (nameBad || phoneBad || wishBad) {
    if (nameBad) setNote('Как вас зовут? Без имени не смогу ответить.', false);
    else if (phoneBad) setNote('Проверьте номер телефона — например +7 900 123-45-67.', false);
    else setNote('Выберите, что хотите заказать.', false);
    return null;
  }
  return phone;
};

// Реальная отправка заявки на бэк вместе с токеном капчи.
const sendOrder = async (captchaToken) => {
  const phone = normalizeRuPhone(contactEl.value);
  if (phone === null) return; // страховка, поля уже провалидированы

  const payload = {
    name: nameEl.value.trim(),
    phone,
    wish: wishValue.value.trim(),
    message: document.getElementById('msg').value.trim(),
    captchaToken: captchaToken || '',
  };

  try {
    const res = await fetch(ORDER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let msg = 'Не получилось отправить заявку. Попробуйте ещё раз или напишите в VK/Telegram.';
      try {
        const data = await res.json();
        if (data && data.error) msg = data.error;
      } catch (_) { /* тело не JSON — оставляем общее сообщение */ }
      throw new Error(msg);
    }
    setNote('Заявка принята — свяжусь с вами в течение дня ✿', true);
    form.reset();
    resetWsel();
    nameEl.classList.remove('err');
    contactEl.classList.remove('err');
    wselWrap.classList.remove('err');
  } catch (err) {
    setNote(err.message, false);
  } finally {
    resetSubmit();
    // токен капчи одноразовый — сбрасываем виджет, чтобы для новой заявки
    // человек прошёл проверку заново. reset() у виджета иногда бросает
    // внутреннюю React-ошибку — гасим, чтобы не всплывала наружу.
    captchaToken = '';
    try {
      if (captchaWidgetId !== null && window.smartCaptcha) window.smartCaptcha.reset(captchaWidgetId);
    } catch (_) { /* внутренняя ошибка виджета — не критично */ }
  }
};

form.addEventListener('submit', (e) => {
  e.preventDefault();

  // Сначала валидация полей.
  if (validateForm() === null) return;

  // Токен видимой капчи: берём текущий ответ виджета (или сохранённый из callback).
  const widgetReady = captchaWidgetId !== null && window.smartCaptcha;
  const token = widgetReady ? (window.smartCaptcha.getResponse(captchaWidgetId) || captchaToken) : '';

  // Если виджет капчи есть, но не пройден — просим отметить «Я не робот».
  // Если виджет вообще не загрузился (локалка без сети/домена) — не блокируем,
  // бэк сам решит по наличию SMARTCAPTCHA_SERVER_KEY.
  if (widgetReady && !token) {
    setNote('Пожалуйста, отметьте «Я не робот».', false);
    return;
  }

  submitBtn.textContent = 'Отправляем…';
  submitBtn.disabled = true;
  sendOrder(token);
});
