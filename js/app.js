import {
    isNative, canSchedule, vibrateTap, vibrateGoal, playClick, setKeepAwake,
    ensureNotifyPermission, notifyNow, scheduleReminders, onBackButton, exitApp, setBarsDark,
} from './platform.js';

/* ================= Data ================= */

const PRESETS = [
    { id: 'subhan', text: 'سبحان الله', target: 33 },
    { id: 'hamd', text: 'الحمد لله', target: 33 },
    { id: 'akbar', text: 'الله أكبر', target: 33 },
    { id: 'tahlil', text: 'لا إله إلا الله', target: 100 },
    { id: 'tahlil_full', text: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير', target: 100,
        virtue: 'من قالها في يوم مئة مرة كانت له عدل عشر رقاب — متفق عليه' },
    { id: 'bihamdihi', text: 'سبحان الله وبحمده', target: 100,
        virtue: 'من قالها في يوم مئة مرة حُطّت خطاياه وإن كانت مثل زبد البحر — متفق عليه' },
    { id: 'azim', text: 'سبحان الله وبحمده، سبحان الله العظيم', target: 33,
        virtue: 'كلمتان خفيفتان على اللسان، ثقيلتان في الميزان، حبيبتان إلى الرحمن — متفق عليه' },
    { id: 'istighfar', text: 'أستغفر الله', target: 100,
        virtue: '«وإني لأستغفر الله في اليوم مئة مرة» — رواه مسلم' },
    { id: 'hawqala', text: 'لا حول ولا قوة إلا بالله', target: 33,
        virtue: 'كنز من كنوز الجنة — متفق عليه' },
    { id: 'salawat', text: 'اللهم صلِّ وسلّم على نبينا محمد', target: 100,
        virtue: 'من صلّى عليّ صلاة صلّى الله عليه بها عشرًا — رواه مسلم' },
    { id: 'baqiyat', text: 'سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر', target: 33,
        virtue: 'أحب الكلام إلى الله أربع — رواه مسلم' },
    { id: 'yunus', text: 'لا إله إلا أنت سبحانك إني كنت من الظالمين', target: 33,
        virtue: 'لم يدعُ بها رجل مسلم في شيء قط إلا استجاب الله له — رواه الترمذي' },
    { id: 'hasbi', text: 'حسبي الله ونعم الوكيل', target: 33 },
];

const PRAYER_SEQ = [
    { id: 'subhan', n: 33 },
    { id: 'hamd', n: 33 },
    { id: 'akbar', n: 33 },
    { id: 'tahlil_full', n: 1 },
];
const PRAYER_VIRTUE = 'من سبّح الله دبر كل صلاة 33 وحمده 33 وكبّره 33 وختم المئة بالتهليل غُفرت خطاياه — رواه مسلم';

const DEFAULT_SETTINGS = {
    vibrateTap: true,
    vibrateGoal: true,
    vibrateStrength: 'medium',
    sound: false,
    notifyGoal: true,
    remindMorning: false,
    morningTime: '06:30',
    remindEvening: false,
    eveningTime: '17:30',
    remindFriday: false,
    remindEvery: '0',
    tapAnywhere: false,
    keepAwake: true,
    fontSize: 'm',
    theme: 'image',
};

const STORE_KEY = 'sab7.v2';
const RING_LEN = 2 * Math.PI * 90;

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY));
        if (raw && typeof raw === 'object') return raw;
    } catch { /* ignore corrupted data */ }
    return {};
}
const saved = load();
const db = {
    settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
    custom: Array.isArray(saved.custom) ? saved.custom : [],
    targets: saved.targets || {},
    state: {
        mode: 'free', dhikrId: 'subhan', count: 0, rounds: 0, seqStep: 0, seqCount: 0, prayersDone: 0,
        ...(saved.state || {}),
    },
    stats: { total: 0, days: {}, perDhikr: {}, ...(saved.stats || {}) },
};

let saveTimer;
function save(now = false) {
    clearTimeout(saveTimer);
    const write = () => {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ }
    };
    if (now) write(); else saveTimer = setTimeout(write, 250);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

/* ================= Helpers ================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const nf = new Intl.NumberFormat('en-US');
const fmt = (n) => nf.format(n);
const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const allDhikr = () => [...PRESETS, ...db.custom];
const findDhikr = (id) => allDhikr().find((d) => d.id === id) || PRESETS[0];
const targetFor = (id) => (id in db.targets ? db.targets[id] : findDhikr(id).target);
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const el = {
    count: $('#count'), target: $('#targetLabel'), rounds: $('#roundsLabel'), ring: $('#ringBar'),
    counter: $('#counterBtn'), zone: $('#counterZone'), ripple: $('#rippleLayer'), hint: $('#hint'),
    dhikrText: $('#dhikrText'), dhikrVirtue: $('#dhikrVirtue'), dhikrChange: $('#dhikrChange'),
    today: $('#todayPill'), seq: $('#seqSteps'), targetBtnLabel: $('#btnTargetLabel'),
    toast: $('#toast'), backdrop: $('#backdrop'),
};
el.ring.style.strokeDasharray = RING_LEN;

let toastTimer;
function toast(msg, ms = 2200) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

function celebrate() {
    const box = $('#celebrate');
    box.innerHTML = '';
    for (let i = 0; i < 22; i++) {
        const s = document.createElement('span');
        const a = (Math.PI * 2 * i) / 22;
        const r = 110 + Math.random() * 90;
        s.style.setProperty('--dx', `${Math.cos(a) * r}px`);
        s.style.setProperty('--dy', `${Math.sin(a) * r}px`);
        s.style.animationDelay = `${Math.random() * 80}ms`;
        if (i % 3 === 0) s.style.background = 'var(--green)';
        box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 1200);
}

/* ================= Rendering ================= */

let flashDone = false;
let flashTimer;

function currentView() {
    const s = db.state;
    if (s.mode === 'prayer') {
        const step = PRAYER_SEQ[s.seqStep] || PRAYER_SEQ[0];
        const d = findDhikr(step.id);
        return { dhikr: d, count: s.seqCount, target: step.n, virtue: PRAYER_VIRTUE };
    }
    const d = findDhikr(s.dhikrId);
    return { dhikr: d, count: s.count, target: targetFor(d.id), virtue: d.virtue || '' };
}

let lastText = '';
function render() {
    const s = db.state;
    const v = currentView();

    if (v.dhikr.text !== lastText) {
        el.dhikrText.textContent = v.dhikr.text;
        el.dhikrText.classList.toggle('long', v.dhikr.text.length > 38);
        el.dhikrText.classList.remove('swap');
        void el.dhikrText.offsetWidth;
        el.dhikrText.classList.add('swap');
        lastText = v.dhikr.text;
    }
    el.dhikrVirtue.textContent = v.virtue;
    el.dhikrChange.hidden = s.mode === 'prayer';

    const shownCount = flashDone ? v.target : v.count;
    el.count.textContent = fmt(shownCount);
    el.target.textContent = v.target ? `من ${fmt(v.target)}` : 'بلا حد';
    const progress = v.target ? Math.min(shownCount / v.target, 1) : (shownCount % 100) / 100;
    el.ring.style.strokeDashoffset = RING_LEN * (1 - progress);
    el.counter.classList.toggle('done', flashDone);

    if (s.mode === 'prayer') {
        el.rounds.textContent = `المرحلة ${fmt(s.seqStep + 1)} من ${fmt(PRAYER_SEQ.length)}`;
        el.seq.hidden = false;
        el.seq.innerHTML = PRAYER_SEQ.map((st, i) => {
            const w = i < s.seqStep ? 100 : i === s.seqStep ? (s.seqCount / st.n) * 100 : 0;
            return `<span><i style="width:${w}%"></i></span>`;
        }).join('');
    } else {
        el.rounds.textContent = s.rounds ? `✓ أتممت ${fmt(s.rounds)} ${s.rounds === 1 ? 'دورة' : 'دورات'}` : '';
        el.seq.hidden = true;
    }

    el.targetBtnLabel.textContent = s.mode === 'prayer' ? 'الهدف 100' : v.target ? `الهدف ${fmt(v.target)}` : 'بلا حد';
    $('#btnTarget').disabled = s.mode === 'prayer';
    $('#btnUndo').disabled = undoStack.length === 0;
    $$('.seg').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.mode));

    el.today.textContent = `اليوم ${fmt(db.stats.days[dayKey()] || 0)}`;
    el.hint.textContent = db.settings.tapAnywhere ? 'اضغط في أي مكان من المنطقة للتسبيح' : 'اضغط على الدائرة للتسبيح';
}

/* ================= Counting ================= */

const undoStack = [];

function addStat(id, delta, day = dayKey()) {
    const st = db.stats;
    st.total = Math.max(0, st.total + delta);
    st.days[day] = Math.max(0, (st.days[day] || 0) + delta);
    st.perDhikr[id] = Math.max(0, (st.perDhikr[id] || 0) + delta);
}

function goalFeedback(title, body, big = false) {
    const set = db.settings;
    if (set.vibrateGoal) vibrateGoal();
    if (set.sound) playClick(true);
    celebrate();
    toast(title);
    if (set.notifyGoal && (big || document.hidden || isNative)) notifyNow(title, body);
}

function increment() {
    const s = db.state;
    const set = db.settings;
    const snapshot = { ...s, day: dayKey() };

    clearTimeout(flashTimer);
    flashDone = false;

    let countedId;
    let reachedGoal = false;

    if (s.mode === 'prayer') {
        const step = PRAYER_SEQ[s.seqStep];
        countedId = step.id;
        s.seqCount++;
        if (s.seqCount >= step.n) {
            reachedGoal = true;
            if (s.seqStep === PRAYER_SEQ.length - 1) {
                s.prayersDone++;
                s.seqStep = 0;
                s.seqCount = 0;
                goalFeedback('تقبّل الله منك 🤍', 'أتممت أذكار ما بعد الصلاة', true);
            } else {
                s.seqStep++;
                s.seqCount = 0;
                const next = findDhikr(PRAYER_SEQ[s.seqStep].id).text;
                if (set.vibrateGoal) vibrateGoal();
                if (set.sound) playClick(true);
                toast(`أحسنت ✓ التالي: ${next.length > 26 ? next.slice(0, 26) + '…' : next}`);
            }
        }
    } else {
        countedId = s.dhikrId;
        const target = targetFor(s.dhikrId);
        s.count++;
        if (target && s.count >= target) {
            reachedGoal = true;
            s.count = 0;
            s.rounds++;
            flashDone = true;
            flashTimer = setTimeout(() => { flashDone = false; render(); }, 900);
            goalFeedback(`ما شاء الله! أتممت ${fmt(target)} ✓`, `${findDhikr(countedId).text} — الدورة ${fmt(s.rounds)}`);
        }
    }

    if (!reachedGoal) {
        if (set.vibrateTap) vibrateTap(set.vibrateStrength);
        if (set.sound) playClick(false);
    }

    addStat(countedId, 1, snapshot.day);
    undoStack.push({ snapshot, countedId });
    if (undoStack.length > 200) undoStack.shift();

    el.count.classList.remove('bump');
    void el.count.offsetWidth;
    el.count.classList.add('bump');
    render();
    save();
}

function undo() {
    const last = undoStack.pop();
    if (!last) return;
    const { day, ...prev } = last.snapshot;
    Object.assign(db.state, prev);
    addStat(last.countedId, -1, day);
    clearTimeout(flashTimer);
    flashDone = false;
    if (db.settings.vibrateTap) vibrateTap('light');
    render();
    save();
}

async function resetCounter() {
    const ok = await confirmBox(db.state.mode === 'prayer' ? 'إعادة أذكار الصلاة من البداية؟' : 'تصفير العداد الحالي؟ (الإحصائيات تبقى محفوظة)');
    if (!ok) return;
    const s = db.state;
    if (s.mode === 'prayer') { s.seqStep = 0; s.seqCount = 0; } else { s.count = 0; s.rounds = 0; }
    undoStack.length = 0;
    flashDone = false;
    render();
    save();
    toast('تم التصفير');
}

function ripple(e) {
    const rect = el.counter.getBoundingClientRect();
    const r = document.createElement('span');
    r.className = 'ripple';
    const x = e && e.clientX ? e.clientX - rect.left : rect.width / 2;
    const y = e && e.clientY ? e.clientY - rect.top : rect.height / 2;
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    el.ripple.appendChild(r);
    setTimeout(() => r.remove(), 600);
}

function press(e) {
    el.counter.classList.add('press');
    setTimeout(() => el.counter.classList.remove('press'), 90);
    ripple(e);
    increment();
}

el.counter.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.stopPropagation();
    press(e);
});
// Keyboard / accessibility-generated clicks (no pointer involved).
el.counter.addEventListener('click', (e) => { if (e.detail === 0) press(null); });
el.zone.addEventListener('pointerdown', (e) => {
    if (!db.settings.tapAnywhere || !e.isPrimary || e.button > 0) return;
    press(null);
});
el.counter.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
    if (openSheets.length || !$('#confirmDialog').hidden) {
        if (e.key === 'Escape') closeTopSheet();
        return;
    }
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); press(null); }
    else if (e.key === 'Backspace' || e.key === 'z' || e.key === 'ArrowDown') { e.preventDefault(); undo(); }
});

$('#btnUndo').addEventListener('click', undo);
$('#btnReset').addEventListener('click', resetCounter);

/* ================= Mode ================= */

$$('.seg').forEach((b) => b.addEventListener('click', () => {
    if (db.state.mode === b.dataset.mode) return;
    db.state.mode = b.dataset.mode;
    undoStack.length = 0;
    flashDone = false;
    render();
    save();
    if (db.settings.vibrateTap) vibrateTap('light');
}));

/* ================= Sheets ================= */

const openSheets = [];

function openSheet(id) {
    const sheet = document.getElementById(id);
    if (openSheets.includes(sheet)) return;
    sheet.hidden = false;
    sheet.scrollTop = 0;
    sheet.style.transform = '';
    el.backdrop.hidden = false;
    openSheets.push(sheet);
}
function closeSheet(sheet) {
    sheet.hidden = true;
    const i = openSheets.indexOf(sheet);
    if (i >= 0) openSheets.splice(i, 1);
    if (!openSheets.length) el.backdrop.hidden = true;
}
function closeTopSheet() {
    if (!$('#confirmDialog').hidden) { $('#confirmNo').click(); return true; }
    const top = openSheets[openSheets.length - 1];
    if (top) { closeSheet(top); return true; }
    return false;
}
el.backdrop.addEventListener('click', closeTopSheet);
$$('[data-close]').forEach((b) => b.addEventListener('click', () => closeSheet(b.closest('.sheet'))));

// Swipe a sheet down to close it.
$$('.sheet').forEach((sheet) => {
    let startY = null;
    let dy = 0;
    sheet.addEventListener('touchstart', (e) => {
        startY = sheet.scrollTop <= 0 ? e.touches[0].clientY : null;
        dy = 0;
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
        if (startY === null) return;
        dy = e.touches[0].clientY - startY;
        if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
        if (startY === null) return;
        sheet.style.transition = 'transform .2s';
        if (dy > 110) {
            sheet.style.transform = 'translateY(100%)';
            setTimeout(() => { closeSheet(sheet); sheet.style.transition = ''; sheet.style.transform = ''; }, 200);
        } else {
            sheet.style.transform = '';
            setTimeout(() => { sheet.style.transition = ''; }, 200);
        }
        startY = null;
    });
});

let confirmResolve;
function confirmBox(text) {
    $('#confirmText').textContent = text;
    $('#confirmDialog').hidden = false;
    return new Promise((res) => { confirmResolve = res; });
}
function closeConfirm(v) {
    $('#confirmDialog').hidden = true;
    if (confirmResolve) confirmResolve(v);
    confirmResolve = null;
}
$('#confirmYes').addEventListener('click', () => closeConfirm(true));
$('#confirmNo').addEventListener('click', () => closeConfirm(false));

onBackButton(() => {
    if (!closeTopSheet()) exitApp();
});

/* ================= Dhikr list ================= */

function renderList() {
    const cur = db.state.dhikrId;
    $('#dhikrList').innerHTML = allDhikr().map((d) => {
        const t = targetFor(d.id);
        const total = db.stats.perDhikr[d.id] || 0;
        const isCustom = !PRESETS.some((p) => p.id === d.id);
        return `<li class="dhikr-item${d.id === cur ? ' active' : ''}">
            <button class="pick" data-id="${d.id}">
                <span class="t">${escapeHtml(d.text)}</span>
                <span class="m">الهدف: ${t ? fmt(t) : 'بلا حد'} · المجموع: ${fmt(total)}</span>
            </button>
            ${isCustom ? `<button class="del" data-del="${d.id}" aria-label="حذف"><svg><use href="#i-trash"/></svg></button>` : ''}
        </li>`;
    }).join('');
}

$('#dhikrList').addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-id]');
    const del = e.target.closest('[data-del]');
    if (del) {
        if (!(await confirmBox('حذف هذا الذكر من القائمة؟'))) return;
        db.custom = db.custom.filter((d) => d.id !== del.dataset.del);
        delete db.targets[del.dataset.del];
        if (db.state.dhikrId === del.dataset.del) selectDhikr('subhan', false);
        renderList();
        render();
        save();
        return;
    }
    if (pick) {
        selectDhikr(pick.dataset.id);
        closeSheet($('#sheetList'));
    }
});

function selectDhikr(id, announce = true) {
    const s = db.state;
    if (s.dhikrId !== id) {
        s.dhikrId = id;
        s.count = 0;
        s.rounds = 0;
        undoStack.length = 0;
    }
    s.mode = 'free';
    flashDone = false;
    render();
    save();
    if (announce) toast('تم اختيار الذكر');
}

$('#addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#addText').value.trim().replace(/\s+/g, ' ');
    if (!text) return;
    const target = Math.max(0, Math.min(100000, parseInt($('#addTarget').value, 10) || 0));
    const id = `c${Date.now().toString(36)}`;
    db.custom.push({ id, text, target });
    $('#addText').value = '';
    selectDhikr(id, false);
    renderList();
    closeSheet($('#sheetList'));
    toast('تمت إضافة الذكر ✓');
});

const openList = () => {
    if (db.state.mode === 'prayer') {
        toast('في أذكار الصلاة يتغير الذكر تلقائيًا');
        return;
    }
    renderList();
    openSheet('sheetList');
};
$('#btnList').addEventListener('click', () => { renderList(); openSheet('sheetList'); });
$('#dhikrCard').addEventListener('click', openList);

/* ================= Target ================= */

function renderTargetChips() {
    const t = targetFor(db.state.dhikrId);
    $$('#targetChips button').forEach((b) => b.classList.toggle('active', Number(b.dataset.target) === t));
}
function setTarget(n) {
    db.targets[db.state.dhikrId] = n;
    if (n && db.state.count >= n) db.state.count = 0;
    render();
    save();
    closeSheet($('#sheetTarget'));
    toast(n ? `الهدف: ${fmt(n)}` : 'بلا حد');
}
$('#btnTarget').addEventListener('click', () => { renderTargetChips(); openSheet('sheetTarget'); });
$('#targetChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-target]');
    if (b) setTarget(Number(b.dataset.target));
});
$('#customTargetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = parseInt($('#customTarget').value, 10);
    if (!n || n < 1) { toast('أدخل رقمًا صحيحًا'); return; }
    setTarget(Math.min(n, 100000));
    $('#customTarget').value = '';
});

/* ================= Stats ================= */

function renderStats() {
    const days = db.stats.days;
    const today = new Date();
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        last7.push({ d, n: days[dayKey(d)] || 0 });
    }
    const week = last7.reduce((a, b) => a + b.n, 0);
    const max = Math.max(1, ...last7.map((x) => x.n));

    let streak = 0;
    const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (days[dayKey(cursor)]) { streak++; cursor.setDate(cursor.getDate() - 1); }

    $('#stToday').textContent = fmt(days[dayKey()] || 0);
    $('#stWeek').textContent = fmt(week);
    $('#stTotal').textContent = fmt(db.stats.total);
    $('#stStreak').textContent = fmt(streak);

    const dayName = new Intl.DateTimeFormat('ar', { weekday: 'short' });
    $('#stBars').innerHTML = last7.map((x, i) => `
        <div class="bar${i === 6 ? ' today' : ''}">
            <em>${x.n ? fmt(x.n) : ''}</em>
            <i style="height:${(x.n / max) * 100}%"></i>
            <small>${i === 6 ? 'اليوم' : dayName.format(x.d)}</small>
        </div>`).join('');

    const top = Object.entries(db.stats.perDhikr)
        .filter(([id, n]) => n > 0 && allDhikr().some((d) => d.id === id))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    $('#stTop').innerHTML = top.length
        ? top.map(([id, n]) => `<li><span>${escapeHtml(findDhikr(id).text)}</span><span>${fmt(n)}</span></li>`).join('')
        : '<li><span class="muted">لا توجد بيانات بعد — ابدأ التسبيح 🌿</span><span></span></li>';

    const best = Object.entries(days).sort((a, b) => b[1] - a[1])[0];
    const prayers = db.state.prayersDone ? `أتممت أذكار الصلاة ${fmt(db.state.prayersDone)} مرة` : '';
    const bestTxt = best && best[1] ? `أفضل يوم: ${fmt(best[1])} تسبيحة` : '';
    $('#stBest').textContent = [bestTxt, prayers].filter(Boolean).join(' · ');
}
$('#btnStats').addEventListener('click', () => { renderStats(); openSheet('sheetStats'); });

/* ================= Settings ================= */

function applySettings() {
    const set = db.settings;
    document.body.dataset.theme = set.theme;
    document.body.dataset.font = set.fontSize;
    const themeColor = { image: '#0b1411', emerald: '#07241c', night: '#0c0f1a', light: '#f5f1e8' }[set.theme] || '#0b1411';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', themeColor);
    setBarsDark(set.theme !== 'light');
    setKeepAwake(set.keepAwake);
}

function renderSettings() {
    const set = db.settings;
    $$('[data-setting]').forEach((i) => { i.checked = !!set[i.dataset.setting]; });
    $$('[data-setting-time]').forEach((i) => { i.value = set[i.dataset.settingTime]; });
    $$('[data-setting-seg]').forEach((g) => {
        g.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === String(set[g.dataset.settingSeg])));
    });
    $('#notifNote').textContent = canSchedule
        ? 'التذكيرات تصلك حتى لو كان التطبيق مغلقًا.'
        : 'التذكيرات المجدولة تعمل في تطبيق أندرويد (APK). في المتصفح تعمل إشعارات إكمال الهدف فقط.';
}

const REMINDER_KEYS = ['remindMorning', 'remindEvening', 'remindFriday', 'morningTime', 'eveningTime', 'remindEvery'];
const PERIODIC_LINES = [
    'سبحان الله وبحمده، سبحان الله العظيم',
    'لا حول ولا قوة إلا بالله',
    'أستغفر الله وأتوب إليه',
    'اللهم صلِّ وسلّم على نبينا محمد',
    'لا إله إلا الله وحده لا شريك له',
    'الحمد لله حمدًا كثيرًا طيبًا مباركًا فيه',
];

function buildReminders() {
    const set = db.settings;
    const list = [];
    const hm = (t) => { const [h, m] = t.split(':').map(Number); return { hour: h || 0, minute: m || 0 }; };
    if (set.remindMorning) list.push({ id: 1, title: 'أذكار الصباح ☀️', body: 'حان وقت أذكار الصباح، ابدأ يومك بذكر الله', on: hm(set.morningTime) });
    if (set.remindEvening) list.push({ id: 2, title: 'أذكار المساء 🌙', body: 'حان وقت أذكار المساء، لا تنسَ ذكر الله', on: hm(set.eveningTime) });
    if (set.remindFriday) list.push({ id: 3, title: 'يوم الجمعة 🤍', body: 'أكثِروا من الصلاة على النبي ﷺ في يوم الجمعة', on: { weekday: 6, hour: 10, minute: 0 } });
    const every = Number(set.remindEvery);
    if (every > 0) {
        let k = 0;
        for (let h = 9; h <= 22; h += every) {
            list.push({ id: 10 + k, title: 'تذكير بالتسبيح 📿', body: PERIODIC_LINES[k % PERIODIC_LINES.length], on: { hour: h, minute: 0 } });
            k++;
        }
    }
    return list;
}

async function syncReminders(userAction = false) {
    const list = buildReminders();
    if (!canSchedule) {
        if (userAction && list.length) toast('التذكيرات المجدولة تعمل في تطبيق أندرويد');
        return;
    }
    if (list.length && userAction) {
        const ok = await ensureNotifyPermission();
        if (!ok) {
            toast('يرجى السماح بالإشعارات من إعدادات الهاتف');
            return;
        }
    }
    const done = await scheduleReminders(list);
    if (userAction && done && list.length) toast('تم ضبط التذكيرات ✓');
}

async function changeSetting(key, value) {
    db.settings[key] = value;
    save();
    applySettings();
    render();
    if (key === 'notifyGoal' && value) {
        const ok = await ensureNotifyPermission();
        if (!ok) toast('لم يتم السماح بالإشعارات');
    }
    if (REMINDER_KEYS.includes(key)) await syncReminders(true);
    if ((key === 'vibrateTap' || key === 'vibrateStrength') && db.settings.vibrateTap) vibrateTap(db.settings.vibrateStrength);
    if (key === 'vibrateGoal' && value) vibrateGoal();
    if (key === 'sound' && value) playClick(false);
}

$$('[data-setting]').forEach((i) => i.addEventListener('change', () => changeSetting(i.dataset.setting, i.checked)));
$$('[data-setting-time]').forEach((i) => i.addEventListener('change', () => { if (i.value) changeSetting(i.dataset.settingTime, i.value); }));
$$('[data-setting-seg]').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    g.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    changeSetting(g.dataset.settingSeg, b.dataset.value);
}));

$('#btnSettings').addEventListener('click', () => { renderSettings(); openSheet('sheetSettings'); });

$('#btnTestNotif').addEventListener('click', async () => {
    const ok = await ensureNotifyPermission();
    if (!ok) { toast('الإشعارات غير مسموحة على هذا الجهاز'); return; }
    const sent = await notifyNow('سُبحة 📿', 'سبحان الله وبحمده، سبحان الله العظيم');
    toast(sent ? 'تم إرسال إشعار تجريبي' : 'تعذر إرسال الإشعار');
});

$('#btnWipe').addEventListener('click', async () => {
    if (!(await confirmBox('سيتم حذف كل الإحصائيات نهائيًا. هل أنت متأكد؟'))) return;
    db.stats = { total: 0, days: {}, perDhikr: {} };
    db.state.prayersDone = 0;
    undoStack.length = 0;
    save(true);
    render();
    toast('تم حذف الإحصائيات');
});

/* ================= Boot ================= */

// Keep only ~13 months of daily history.
(function pruneDays() {
    const keys = Object.keys(db.stats.days).sort();
    while (keys.length > 400) delete db.stats.days[keys.shift()];
})();

if (!findDhikr(db.state.dhikrId) || !allDhikr().some((d) => d.id === db.state.dhikrId)) db.state.dhikrId = 'subhan';
if (db.state.seqStep >= PRAYER_SEQ.length) db.state.seqStep = 0;

applySettings();
render();
syncReminders(false);

// Re-render around midnight so "today" stays correct.
setInterval(() => render(), 60 * 1000);

if (!isNative && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}
