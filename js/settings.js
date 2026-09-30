// Settings sheet, theme, reminders, backup/restore.
import { db, save, $, $$, emit, replaceAll, dayKey } from './store.js';
import { PERIODIC_LINES } from './data.js';
import {
    canSchedule, ensureNotifyPermission, notifyNow, scheduleReminders, setKeepAwake, setBarsDark,
    vibrateTap, vibrateGoal, vibratePulse, playClick, hasVolumeKeys, setVolumeKeys, shareText,
} from './platform.js';
import { toast, openSheet, closeSheet, confirmBox } from './ui.js';

const THEME_COLORS = { image: '#0b1411', emerald: '#07241c', night: '#0c0f1a', light: '#f5f1e8' };

export function applySettings() {
    const set = db.settings;
    document.body.dataset.theme = set.theme;
    document.body.dataset.font = set.fontSize;
    const color = THEME_COLORS[set.theme] || THEME_COLORS.image;
    document.querySelector('meta[name="theme-color"]').setAttribute('content', color);
    setBarsDark(set.theme !== 'light', color);
    setKeepAwake(set.keepAwake);
    setVolumeKeys(set.volumeKeys);
}

// Checkboxes / segmented controls marked with data-setting live in several places (settings sheet, prayer tab).
export function renderSettingControls() {
    const set = db.settings;
    $$('[data-setting]').forEach((i) => { i.checked = !!set[i.dataset.setting]; });
    $$('[data-setting-time]').forEach((i) => { i.value = set[i.dataset.settingTime]; });
    $$('[data-setting-seg]').forEach((g) => {
        g.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === String(set[g.dataset.settingSeg])));
    });
}

function renderSettings() {
    renderSettingControls();
    $('#volumeRow').hidden = !hasVolumeKeys;
    $('#notifNote').textContent = canSchedule
        ? 'التذكيرات تصلك حتى لو كان التطبيق مغلقًا.'
        : 'التذكيرات المجدولة تعمل في تطبيق أندرويد (APK). في المتصفح تعمل إشعارات إكمال الهدف فقط.';
}

/* ---------- Reminders ---------- */
const REMINDER_KEYS = ['remindMorning', 'remindEvening', 'remindFriday', 'morningTime', 'eveningTime', 'remindEvery'];

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

export async function syncReminders(userAction = false) {
    const list = buildReminders();
    if (!canSchedule) {
        if (userAction && list.length) toast('التذكيرات المجدولة تعمل في تطبيق أندرويد');
        return;
    }
    if (list.length && userAction && !(await ensureNotifyPermission())) {
        toast('يرجى السماح بالإشعارات من إعدادات الهاتف');
        return;
    }
    const done = await scheduleReminders(list);
    if (userAction && done && list.length) toast('تم ضبط التذكيرات ✓');
}

/* ---------- Changing a setting ---------- */
export async function changeSetting(key, value) {
    db.settings[key] = value;
    save();
    applySettings();
    renderSettingControls();
    emit('setting', { key, value });
    if (key === 'notifyGoal' && value && !(await ensureNotifyPermission())) toast('لم يتم السماح بالإشعارات');
    if (REMINDER_KEYS.includes(key)) await syncReminders(true);
    if ((key === 'vibrateTap' || key === 'vibrateStrength') && db.settings.vibrateTap) vibrateTap(db.settings.vibrateStrength);
    if (key === 'vibrateGoal' && value) vibrateGoal();
    if (key === 'pulse10' && value) vibratePulse();
    if (key === 'sound' && value) playClick(false);
    if (key === 'volumeKeys' && value) toast('اضغط زر رفع أو خفض الصوت للتسبيح 🔊');
}

/* ---------- Backup ---------- */
async function exportData() {
    const text = JSON.stringify({ app: 'sab7', v: 3, date: dayKey(), data: db });
    const r = await shareText('نسخة احتياطية — سُبحة', text);
    if (r === 'copied') toast('تم نسخ النسخة الاحتياطية — احفظها في مكان آمن');
    else if (r === 'failed') toast('تعذر التصدير');
}

async function importData() {
    let parsed;
    try {
        parsed = JSON.parse($('#importText').value.trim());
    } catch {
        toast('النص غير صالح');
        return;
    }
    const data = parsed && parsed.app === 'sab7' ? parsed.data : parsed;
    if (!data || typeof data !== 'object' || !data.stats) { toast('هذه ليست نسخة احتياطية من سُبحة'); return; }
    if (!(await confirmBox('سيتم استبدال بياناتك الحالية بالنسخة الاحتياطية. متابعة؟', 'استعادة'))) return;
    replaceAll(data);
    toast('تمت الاستعادة ✓ جارٍ إعادة التشغيل...');
    setTimeout(() => location.reload(), 900);
}

export function initSettings() {
    $$('[data-setting]').forEach((i) => i.addEventListener('change', () => changeSetting(i.dataset.setting, i.checked)));
    $$('[data-setting-time]').forEach((i) => i.addEventListener('change', () => { if (i.value) changeSetting(i.dataset.settingTime, i.value); }));
    $$('[data-setting-seg]').forEach((g) => g.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        changeSetting(g.dataset.settingSeg, b.dataset.value);
    }));

    $('#btnSettings').addEventListener('click', () => { renderSettings(); openSheet('sheetSettings'); });

    $('#btnTestNotif').addEventListener('click', async () => {
        if (!(await ensureNotifyPermission())) { toast('الإشعارات غير مسموحة على هذا الجهاز'); return; }
        const sent = await notifyNow('سُبحة 📿', 'سبحان الله وبحمده، سبحان الله العظيم');
        toast(sent ? 'تم إرسال إشعار تجريبي' : 'تعذر إرسال الإشعار');
    });

    $('#btnExport').addEventListener('click', exportData);
    $('#btnImport').addEventListener('click', () => { $('#importText').value = ''; openSheet('sheetImport'); });
    $('#btnDoImport').addEventListener('click', importData);

    $('#btnWipe').addEventListener('click', async () => {
        if (!(await confirmBox('سيتم حذف كل الإحصائيات والإنجازات نهائيًا. هل أنت متأكد؟', 'حذف'))) return;
        db.stats = { total: 0, days: {}, perDhikr: {} };
        db.state.prayersDone = 0;
        db.achievements = {};
        db.goal = { lastHit: null };
        db.adhkar.done = {};
        db.adhkar.last = {};
        db.flags = {};
        save(true);
        closeSheet('sheetSettings');
        emit('stats', {});
        toast('تم حذف الإحصائيات');
    });

    renderSettingControls();
    syncReminders(false);
}
