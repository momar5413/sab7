// Adhkar tab: morning / evening / sleep / after-prayer collections with per-item repeat counters.
import { db, save, $, fmt, dayKey, escapeHtml, addStat, emit } from './store.js';
import { ADHKAR, ADHKAR_ORDER } from './data.js';
import { vibrateTap, vibrateGoal, playClick } from './platform.js';
import { toast, celebrate, confirmBox } from './ui.js';

let cat = null;

function defaultCategory() {
    const h = new Date().getHours();
    if (h >= 3 && h < 12) return 'morning';
    if (h >= 12 && h < 20) return 'evening';
    return 'sleep';
}

// Remaining repeats for each item of a category (reset every day).
function progressFor(c) {
    const today = dayKey();
    const items = ADHKAR[c].items;
    let p = db.adhkar.progress[c];
    if (!p || p.day !== today || !Array.isArray(p.left) || p.left.length !== items.length) {
        p = { day: today, left: items.map((it) => it.count), completed: false };
        db.adhkar.progress[c] = p;
    }
    return p;
}

function renderCats() {
    $('#adhkarCats').innerHTML = ADHKAR_ORDER.map((c) => {
        const p = progressFor(c);
        const done = p.left.every((n) => n === 0);
        return `<button class="chip${c === cat ? ' active' : ''}" data-cat="${c}">${ADHKAR[c].icon} ${ADHKAR[c].short}${done ? ' ✓' : ''}</button>`;
    }).join('');
}

function renderHead() {
    const p = progressFor(cat);
    const items = ADHKAR[cat].items;
    const doneItems = p.left.filter((n) => n === 0).length;
    $('#adhkarTitle').textContent = ADHKAR[cat].title;
    $('#adhkarProgressText').textContent = `${fmt(doneItems)} من ${fmt(items.length)}`;
    $('#adhkarProgress').style.width = `${(doneItems / items.length) * 100}%`;
}

function cardHtml(it, i, left) {
    const done = left === 0;
    const repeat = it.count > 1 ? `التكرار: ${fmt(it.count)}` : 'مرة واحدة';
    return `<li class="zikr${done ? ' done' : ''}${it.quran ? ' quran' : ''}" data-i="${i}" tabindex="0">
        <p class="z-text">${escapeHtml(it.text)}</p>
        ${it.note ? `<p class="z-note">${escapeHtml(it.note)}</p>` : ''}
        <div class="z-foot">
            <span class="z-rep">${repeat}</span>
            <span class="z-left">${done ? '<svg><use href="#i-check"/></svg>' : fmt(left)}</span>
        </div>
    </li>`;
}

export function renderAdhkar() {
    if (!cat) cat = defaultCategory();
    const p = progressFor(cat);
    renderCats();
    renderHead();
    $('#adhkarList').innerHTML = ADHKAR[cat].items.map((it, i) => cardHtml(it, i, p.left[i])).join('');
}

function updateCard(i) {
    const p = progressFor(cat);
    const li = $(`#adhkarList [data-i="${i}"]`);
    if (!li) return;
    li.outerHTML = cardHtml(ADHKAR[cat].items[i], i, p.left[i]);
    const fresh = $(`#adhkarList [data-i="${i}"]`);
    fresh.classList.add('tapped');
}

function complete() {
    const p = progressFor(cat);
    if (p.completed) return;
    p.completed = true;
    db.adhkar.done[cat] = (db.adhkar.done[cat] || 0) + 1;
    db.adhkar.last[cat] = dayKey();
    if (db.settings.vibrateGoal) vibrateGoal();
    if (db.settings.sound) playClick(true);
    celebrate(true);
    toast(`تقبّل الله! أتممت ${ADHKAR[cat].title} 🤍`, 2800);
    emit('check');
}

function tap(i) {
    const p = progressFor(cat);
    if (p.left[i] <= 0) return;
    p.left[i]--;
    addStat('adhkar', 1);
    const finishedItem = p.left[i] === 0;
    if (db.settings.vibrateTap) vibrateTap(finishedItem ? 'heavy' : db.settings.vibrateStrength);
    if (db.settings.sound) playClick(false);
    updateCard(i);
    renderHead();
    if (finishedItem) {
        renderCats();
        const next = p.left.findIndex((n) => n > 0);
        if (next === -1) complete();
        else {
            const li = $(`#adhkarList [data-i="${next}"]`);
            if (li) setTimeout(() => li.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
        }
    }
    save();
}

// Used by the volume keys: count the first unfinished item.
export function tapCurrent() {
    if (!cat) return;
    const next = progressFor(cat).left.findIndex((n) => n > 0);
    if (next >= 0) tap(next);
}

export function initAdhkar() {
    $('#adhkarCats').addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat]');
        if (!b || b.dataset.cat === cat) return;
        cat = b.dataset.cat;
        renderAdhkar();
        $('#view-adhkar').scrollTop = 0;
    });
    $('#adhkarList').addEventListener('click', (e) => {
        const li = e.target.closest('[data-i]');
        if (li) tap(Number(li.dataset.i));
    });
    $('#adhkarList').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const li = e.target.closest('[data-i]');
        if (li) { e.preventDefault(); tap(Number(li.dataset.i)); }
    });
    $('#adhkarReset').addEventListener('click', async () => {
        if (!(await confirmBox(`إعادة ${ADHKAR[cat].title} من البداية؟`, 'إعادة'))) return;
        delete db.adhkar.progress[cat];
        renderAdhkar();
        save();
    });
}

export function openAdhkarCategory(c) {
    cat = c;
    renderAdhkar();
}
