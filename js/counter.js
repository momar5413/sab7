// The tasbeeh counter tab: free dhikr, after-prayer sequence, focus mode.
import { db, save, $, $$, fmt, dayKey, escapeHtml, addStat, emit } from './store.js';
import { PRESETS, PRAYER_SEQ, PRAYER_VIRTUE } from './data.js';
import { isNative, vibrateTap, vibrateGoal, vibratePulse, playClick, notifyNow } from './platform.js';
import { toast, celebrate, openSheet, closeSheet, confirmBox, pushBack, popBack } from './ui.js';

const RING_LEN = 2 * Math.PI * 90;

export const allDhikr = () => [...PRESETS, ...db.custom];
export const findDhikr = (id) => allDhikr().find((d) => d.id === id) || PRESETS[0];
const targetFor = (id) => (id in db.targets ? db.targets[id] : findDhikr(id).target);

const el = {};
const undoStack = [];
let flashDone = false;
let flashTimer;
let lastText = '';

/* ================= Rendering ================= */

function currentView() {
    const s = db.state;
    if (s.mode === 'prayer') {
        const step = PRAYER_SEQ[s.seqStep] || PRAYER_SEQ[0];
        return { dhikr: findDhikr(step.id), count: s.seqCount, target: step.n, virtue: PRAYER_VIRTUE };
    }
    const d = findDhikr(s.dhikrId);
    return { dhikr: d, count: s.count, target: targetFor(d.id), virtue: d.virtue || '' };
}

export function renderCounter() {
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

    const shown = flashDone ? v.target : v.count;
    const progress = v.target ? Math.min(shown / v.target, 1) : (shown % 100) / 100;
    el.count.textContent = fmt(shown);
    el.target.textContent = v.target ? `من ${fmt(v.target)}` : 'بلا حد';
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
    el.hint.textContent = db.settings.tapAnywhere ? 'اضغط في أي مكان من المنطقة للتسبيح' : 'اضغط على الدائرة للتسبيح';

    // Focus overlay mirrors the counter.
    if (!el.focus.hidden) {
        el.focusText.textContent = v.dhikr.text;
        el.focusCount.textContent = fmt(shown);
        el.focusTarget.textContent = v.target ? `من ${fmt(v.target)}` : '';
        el.focusBar.style.width = `${progress * 100}%`;
    }
}

/* ================= Counting ================= */

function goalFeedback(title, body, big = false) {
    const set = db.settings;
    if (set.vibrateGoal) vibrateGoal();
    if (set.sound) playClick(true);
    celebrate(big);
    toast(title);
    if (set.notifyGoal && (big || document.hidden || isNative)) notifyNow(title, body);
}

export function increment() {
    const s = db.state;
    const set = db.settings;
    const snapshot = { ...s, day: dayKey() };

    clearTimeout(flashTimer);
    flashDone = false;

    let countedId;
    let reachedGoal = false;
    let n;

    if (s.mode === 'prayer') {
        const step = PRAYER_SEQ[s.seqStep];
        countedId = step.id;
        n = ++s.seqCount;
        if (s.seqCount >= step.n) {
            reachedGoal = true;
            if (s.seqStep === PRAYER_SEQ.length - 1) {
                s.prayersDone++;
                s.seqStep = 0;
                s.seqCount = 0;
                goalFeedback('تقبّل الله منك 🤍', 'أتممت تسبيح ما بعد الصلاة', true);
            } else {
                s.seqStep++;
                s.seqCount = 0;
                const next = findDhikr(PRAYER_SEQ[s.seqStep].id).text;
                if (set.vibrateGoal) vibrateGoal();
                if (set.sound) playClick(true);
                toast(`أحسنت ✓ التالي: ${next.length > 26 ? `${next.slice(0, 26)}…` : next}`);
            }
        }
    } else {
        countedId = s.dhikrId;
        const target = targetFor(s.dhikrId);
        n = ++s.count;
        if (target && s.count >= target) {
            reachedGoal = true;
            s.count = 0;
            s.rounds++;
            flashDone = true;
            flashTimer = setTimeout(() => { flashDone = false; renderCounter(); }, 900);
            goalFeedback(`ما شاء الله! أتممت ${fmt(target)} ✓`, `${findDhikr(countedId).text} — الدورة ${fmt(s.rounds)}`);
        }
    }

    if (!reachedGoal) {
        if (set.pulse10 && n % 10 === 0) vibratePulse();
        else if (set.vibrateTap) vibrateTap(set.vibrateStrength);
        if (set.sound) playClick(false);
    }

    if (!el.focus.hidden) db.flags.focusCount = (db.flags.focusCount || 0) + 1;
    undoStack.push({ snapshot, countedId });
    if (undoStack.length > 200) undoStack.shift();
    addStat(countedId, 1, snapshot.day);

    el.count.classList.remove('bump');
    void el.count.offsetWidth;
    el.count.classList.add('bump');
    renderCounter();
    save();
}

function undo() {
    const last = undoStack.pop();
    if (!last) return;
    const { day, ...prev } = last.snapshot;
    Object.assign(db.state, prev);
    clearTimeout(flashTimer);
    flashDone = false;
    addStat(last.countedId, -1, day);
    if (db.settings.vibrateTap) vibrateTap('light');
    renderCounter();
    save();
}

async function resetCounter() {
    const ok = await confirmBox(db.state.mode === 'prayer' ? 'إعادة تسبيح الصلاة من البداية؟' : 'تصفير العداد الحالي؟ (الإحصائيات تبقى محفوظة)');
    if (!ok) return;
    const s = db.state;
    if (s.mode === 'prayer') { s.seqStep = 0; s.seqCount = 0; } else { s.count = 0; s.rounds = 0; }
    undoStack.length = 0;
    flashDone = false;
    renderCounter();
    save();
    toast('تم التصفير');
}

function ripple(e) {
    const rect = el.counter.getBoundingClientRect();
    const r = document.createElement('span');
    r.className = 'ripple';
    r.style.left = `${e && e.clientX ? e.clientX - rect.left : rect.width / 2}px`;
    r.style.top = `${e && e.clientY ? e.clientY - rect.top : rect.height / 2}px`;
    el.ripple.appendChild(r);
    setTimeout(() => r.remove(), 600);
}

export function press(e) {
    el.counter.classList.add('press');
    setTimeout(() => el.counter.classList.remove('press'), 90);
    ripple(e);
    increment();
}

/* ================= Dhikr selection ================= */

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
    renderCounter();
    save();
    if (announce) toast('تم اختيار الذكر');
}

function stepDhikr(dir) {
    const list = allDhikr();
    const i = list.findIndex((d) => d.id === db.state.dhikrId);
    const next = list[(i + dir + list.length) % list.length];
    selectDhikr(next.id, false);
    if (db.settings.vibrateTap) vibrateTap('light');
}

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

function renderTargetChips() {
    const t = targetFor(db.state.dhikrId);
    $$('#targetChips button').forEach((b) => b.classList.toggle('active', Number(b.dataset.target) === t));
}

function setTarget(n) {
    db.targets[db.state.dhikrId] = n;
    if (n && db.state.count >= n) db.state.count = 0;
    renderCounter();
    save();
    closeSheet('sheetTarget');
    toast(n ? `الهدف: ${fmt(n)}` : 'بلا حد');
}

/* ================= Focus mode ================= */

function closeFocus(fromBack = false) {
    el.focus.hidden = true;
    if (!fromBack) popBack(focusBack);
}
const focusBack = () => closeFocus(true);

function openFocus() {
    el.focus.hidden = false;
    pushBack(focusBack);
    renderCounter();
    toast('وضع التركيز: اضغط في أي مكان', 1600);
}

export const focusOpen = () => !el.focus.hidden;

/* ================= Init ================= */

export function initCounter() {
    Object.assign(el, {
        count: $('#count'), target: $('#targetLabel'), rounds: $('#roundsLabel'), ring: $('#ringBar'),
        counter: $('#counterBtn'), zone: $('#counterZone'), ripple: $('#rippleLayer'), hint: $('#hint'),
        dhikrText: $('#dhikrText'), dhikrVirtue: $('#dhikrVirtue'), dhikrChange: $('#dhikrChange'),
        seq: $('#seqSteps'), targetBtnLabel: $('#btnTargetLabel'),
        focus: $('#focus'), focusText: $('#focusText'), focusCount: $('#focusCount'),
        focusTarget: $('#focusTarget'), focusBar: $('#focusBar'),
    });
    el.ring.style.strokeDasharray = RING_LEN;

    if (!allDhikr().some((d) => d.id === db.state.dhikrId)) db.state.dhikrId = 'subhan';
    if (db.state.seqStep >= PRAYER_SEQ.length) db.state.seqStep = 0;

    el.counter.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.button > 0) return;
        e.stopPropagation();
        press(e);
    });
    // Keyboard / accessibility-generated clicks (no pointer involved).
    el.counter.addEventListener('click', (e) => { if (e.detail === 0) press(null); });
    el.counter.addEventListener('contextmenu', (e) => e.preventDefault());
    el.zone.addEventListener('pointerdown', (e) => {
        if (!db.settings.tapAnywhere || !e.isPrimary || e.button > 0) return;
        press(null);
    });

    $('#btnUndo').addEventListener('click', undo);
    $('#btnReset').addEventListener('click', resetCounter);
    $('#btnFocus').addEventListener('click', openFocus);
    $('#focusExit').addEventListener('click', (e) => { e.stopPropagation(); closeFocus(); });
    $('#focusExit').addEventListener('pointerdown', (e) => e.stopPropagation());
    el.focus.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.button > 0) return;
        press(null);
    });

    $$('.seg').forEach((b) => b.addEventListener('click', () => {
        if (db.state.mode === b.dataset.mode) return;
        db.state.mode = b.dataset.mode;
        undoStack.length = 0;
        flashDone = false;
        renderCounter();
        save();
        if (db.settings.vibrateTap) vibrateTap('light');
    }));

    // Dhikr card: tap opens the list, horizontal swipe switches dhikr.
    const card = $('#dhikrCard');
    let sx = 0;
    let sy = 0;
    let swiped = false;
    card.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiped = false; }, { passive: true });
    card.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (db.state.mode === 'free' && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            swiped = true;
            stepDhikr(dx < 0 ? 1 : -1);
        }
    });
    card.addEventListener('click', () => {
        if (swiped) { swiped = false; return; }
        if (db.state.mode === 'prayer') { toast('في تسبيح الصلاة يتغير الذكر تلقائيًا'); return; }
        renderList();
        openSheet('sheetList');
    });

    $('#btnList').addEventListener('click', () => { renderList(); openSheet('sheetList'); });
    $('#dhikrList').addEventListener('click', async (e) => {
        const pick = e.target.closest('[data-id]');
        const del = e.target.closest('[data-del]');
        if (del) {
            if (!(await confirmBox('حذف هذا الذكر من القائمة؟', 'حذف'))) return;
            db.custom = db.custom.filter((d) => d.id !== del.dataset.del);
            delete db.targets[del.dataset.del];
            if (db.state.dhikrId === del.dataset.del) selectDhikr('subhan', false);
            renderList();
            renderCounter();
            save();
            return;
        }
        if (pick) {
            selectDhikr(pick.dataset.id);
            closeSheet('sheetList');
        }
    });

    $('#addForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const text = $('#addText').value.trim().replace(/\s+/g, ' ');
        if (!text) return;
        const target = Math.max(0, Math.min(100000, parseInt($('#addTarget').value, 10) || 0));
        const id = `c${Date.now().toString(36)}`;
        db.custom.push({ id, text, target });
        $('#addText').value = '';
        selectDhikr(id, false);
        closeSheet('sheetList');
        toast('تمت إضافة الذكر ✓');
        emit('check');
    });

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

    renderCounter();
}

export const counterKeys = { undo };
