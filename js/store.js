// Persistent state (localStorage) and small shared helpers.

export const STORE_KEY = 'sab7.v2';

export const DEFAULT_SETTINGS = {
    vibrateTap: true,
    vibrateGoal: true,
    vibrateStrength: 'medium',
    pulse10: true,
    sound: false,
    notifyGoal: true,
    remindMorning: false,
    morningTime: '06:30',
    remindEvening: false,
    eveningTime: '17:30',
    remindFriday: false,
    remindEvery: '0',
    tapAnywhere: false,
    volumeKeys: false,
    keepAwake: true,
    fontSize: 'm',
    theme: 'image',
    dailyGoal: 300,
    // Prayer times
    location: null, // { lat, lng, name }
    calcMethod: 'MuslimWorldLeague',
    madhab: 'shafi',
    prayerNotify: false,
    afterPrayerNotify: false,
    onboarded: false,
};

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY));
        if (raw && typeof raw === 'object') return raw;
    } catch { /* ignore corrupted data */ }
    return {};
}

function build(saved) {
    return {
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
        custom: Array.isArray(saved.custom) ? saved.custom : [],
        targets: saved.targets || {},
        state: {
            mode: 'free', dhikrId: 'subhan', count: 0, rounds: 0, seqStep: 0, seqCount: 0, prayersDone: 0,
            ...(saved.state || {}),
        },
        stats: { total: 0, days: {}, perDhikr: {}, ...(saved.stats || {}) },
        adhkar: { progress: {}, done: {}, last: {}, ...(saved.adhkar || {}) },
        achievements: saved.achievements || {},
        goal: { lastHit: null, ...(saved.goal || {}) },
        flags: saved.flags || {},
    };
}

export const db = build(load());

let saveTimer;
export function save(now = false) {
    clearTimeout(saveTimer);
    const write = () => {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ }
    };
    if (now) write(); else saveTimer = setTimeout(write, 250);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

// Replace all data (used by backup import).
export function replaceAll(data) {
    const fresh = build(data || {});
    Object.keys(db).forEach((k) => delete db[k]);
    Object.assign(db, fresh);
    save(true);
}

/* ---------- Event bus ---------- */
const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

/* ---------- Helpers ---------- */
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const nf = new Intl.NumberFormat('en-US');
export const fmt = (n) => nf.format(n);
export const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Stats ---------- */
export function addStat(id, delta, day = dayKey()) {
    const st = db.stats;
    st.total = Math.max(0, st.total + delta);
    st.days[day] = Math.max(0, (st.days[day] || 0) + delta);
    if (id) st.perDhikr[id] = Math.max(0, (st.perDhikr[id] || 0) + delta);
    const h = new Date().getHours();
    if (delta > 0 && h >= 3 && h < 5) db.flags.sahar = true;
    emit('stats', { id, delta });
}

export const todayCount = () => db.stats.days[dayKey()] || 0;

export function streakDays() {
    const days = db.stats.days;
    const now = new Date();
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (days[dayKey(cursor)]) { streak++; cursor.setDate(cursor.getDate() - 1); }
    return streak;
}

// Keep only ~13 months of daily history.
(function pruneDays() {
    const keys = Object.keys(db.stats.days).sort();
    while (keys.length > 400) delete db.stats.days[keys.shift()];
})();
