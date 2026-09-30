// "My progress" tab: daily goal (wird), stats, achievements, sharing. Also drives the header goal ring.
import { db, save, $, $$, fmt, dayKey, escapeHtml, on, todayCount, streakDays } from './store.js';
import { ACHIEVEMENTS, PRESETS } from './data.js';
import { isNative, vibrateGoal, notifyNow, shareText } from './platform.js';
import { toast, celebrate } from './ui.js';

const SMALL_LEN = 2 * Math.PI * 18;
const BIG_LEN = 2 * Math.PI * 52;

const dhikrText = (id) => ([...PRESETS, ...db.custom].find((d) => d.id === id) || {}).text;

/* ================= Header ring + goal ================= */

export function renderGoalRing() {
    const goal = db.settings.dailyGoal;
    const n = todayCount();
    const p = Math.min(n / goal, 1);
    $('#goalBar').style.strokeDasharray = SMALL_LEN;
    $('#goalBar').style.strokeDashoffset = SMALL_LEN * (1 - p);
    $('#goalPct').textContent = p >= 1 ? '✓' : `${Math.floor(p * 100)}%`;
    $('#goalRing').classList.toggle('complete', p >= 1);
}

function checkGoal() {
    const today = dayKey();
    if (db.goal.lastHit === today || todayCount() < db.settings.dailyGoal) return;
    db.goal.lastHit = today;
    save();
    if (db.settings.vibrateGoal) vibrateGoal();
    celebrate(true);
    toast(`🎯 أتممت وِردك اليومي (${fmt(db.settings.dailyGoal)}) — بارك الله فيك`, 3200);
    if (db.settings.notifyGoal && isNative) notifyNow('أتممت وِردك اليومي 🎯', `${fmt(todayCount())} تسبيحة اليوم — بارك الله فيك`);
}

/* ================= Achievements ================= */

export function checkAchievements(silent = false) {
    const ctx = { db, streak: streakDays(), today: dayKey() };
    const fresh = ACHIEVEMENTS.filter((a) => !db.achievements[a.id] && a.test(ctx));
    if (!fresh.length) return;
    fresh.forEach((a) => { db.achievements[a.id] = ctx.today; });
    save();
    if (silent) return;
    const a = fresh[fresh.length - 1];
    setTimeout(() => {
        toast(fresh.length > 1 ? `🏅 ${fmt(fresh.length)} إنجازات جديدة!` : `🏅 إنجاز جديد: ${a.icon} ${a.title}`, 3000);
        celebrate();
    }, 900);
}

/* ================= Tab rendering ================= */

export function renderMe() {
    const days = db.stats.days;
    const goal = db.settings.dailyGoal;
    const n = todayCount();

    // Goal card
    const p = Math.min(n / goal, 1);
    $('#goalBarBig').style.strokeDasharray = BIG_LEN;
    $('#goalBarBig').style.strokeDashoffset = BIG_LEN * (1 - p);
    $('#goalToday').textContent = fmt(n);
    $('#goalOf').textContent = `من ${fmt(goal)}`;
    $('#goalMsg').textContent = p >= 1
        ? 'ما شاء الله! أتممت وِرد اليوم 🤍'
        : `بقي ${fmt(goal - n)} تسبيحة لإتمام وِردك`;
    $$('#goalSeg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.goal) === goal));

    // Stats
    const now = new Date();
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        last7.push({ d, n: days[dayKey(d)] || 0 });
    }
    const max = Math.max(1, ...last7.map((x) => x.n));
    $('#stToday').textContent = fmt(n);
    $('#stWeek').textContent = fmt(last7.reduce((a, b) => a + b.n, 0));
    $('#stTotal').textContent = fmt(db.stats.total);
    $('#stStreak').textContent = fmt(streakDays());

    const dayName = new Intl.DateTimeFormat('ar', { weekday: 'short' });
    $('#stBars').innerHTML = last7.map((x, i) => `
        <div class="bar${i === 6 ? ' today' : ''}${x.n >= goal ? ' hit' : ''}">
            <em>${x.n ? fmt(x.n) : ''}</em>
            <i style="height:${(x.n / max) * 100}%"></i>
            <small>${i === 6 ? 'اليوم' : dayName.format(x.d)}</small>
        </div>`).join('');

    // Achievements
    const unlocked = ACHIEVEMENTS.filter((a) => db.achievements[a.id]).length;
    $('#achCount').textContent = `(${fmt(unlocked)} / ${fmt(ACHIEVEMENTS.length)})`;
    $('#badges').innerHTML = ACHIEVEMENTS.map((a) => {
        const got = !!db.achievements[a.id];
        return `<div class="badge${got ? ' got' : ''}" title="${escapeHtml(a.desc)}">
            <span class="b-ico">${got ? a.icon : '🔒'}</span>
            <b>${escapeHtml(a.title)}</b>
            <small>${escapeHtml(a.desc)}</small>
        </div>`;
    }).join('');

    // Top adhkar
    const top = Object.entries(db.stats.perDhikr)
        .filter(([id, v]) => v > 0 && (dhikrText(id) || id === 'adhkar'))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    $('#stTop').innerHTML = top.length
        ? top.map(([id, v]) => `<li><span>${escapeHtml(id === 'adhkar' ? 'أذكار الصباح والمساء والنوم' : dhikrText(id))}</span><span>${fmt(v)}</span></li>`).join('')
        : '<li><span class="muted">لا توجد بيانات بعد — ابدأ التسبيح 🌿</span><span></span></li>';

    const best = Object.entries(days).sort((a, b) => b[1] - a[1])[0];
    const parts = [];
    if (best && best[1]) parts.push(`أفضل يوم: ${fmt(best[1])} تسبيحة`);
    if (db.state.prayersDone) parts.push(`تسبيح الصلاة: ${fmt(db.state.prayersDone)} مرة`);
    $('#stBest').textContent = parts.join(' · ');
}

async function share() {
    const n = todayCount();
    const text = [
        `📿 تسبيحاتي اليوم: ${fmt(n)}`,
        `🔥 أيام متتالية من الذكر: ${fmt(streakDays())}`,
        `🏅 الإنجازات: ${fmt(Object.keys(db.achievements).length)}`,
        '',
        '«ألا بذكر الله تطمئن القلوب»',
        '— من تطبيق سُبحة',
    ].join('\n');
    const r = await shareText('سُبحة', text);
    if (r === 'copied') toast('تم نسخ النص — الصقه أينما تريد');
    else if (r === 'failed') toast('تعذرت المشاركة');
}

export function initMe() {
    $('#goalSeg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-goal]');
        if (!b) return;
        db.settings.dailyGoal = Number(b.dataset.goal);
        if (db.goal.lastHit === dayKey() && todayCount() < db.settings.dailyGoal) db.goal.lastHit = null;
        save();
        renderMe();
        renderGoalRing();
        checkGoal();
    });
    $('#btnShare').addEventListener('click', share);

    on('stats', () => {
        renderGoalRing();
        checkGoal();
        checkAchievements();
    });
    on('check', () => checkAchievements());

    // Existing users get their earned badges without a flood of toasts.
    checkAchievements(true);
    renderGoalRing();
}
