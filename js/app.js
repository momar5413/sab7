import { db, save, $, $$, on } from './store.js';
import { isNative, onBackButton, exitApp, onVolumeKey, onNotificationTap, ensureNotifyPermission } from './platform.js';
import { initSheets, openSheet, closeSheet, handleBack, anySheetOpen, dialogOpen, toast } from './ui.js';
import { initCounter, renderCounter, press, focusOpen, counterKeys } from './counter.js';
import { initAdhkar, renderAdhkar, tapCurrent, openAdhkarCategory } from './adhkar.js';
import { initPrayer, setPrayerActive } from './prayer.js';
import { initMe, renderMe, renderGoalRing } from './me.js';
import { initSettings, applySettings } from './settings.js';

/* ================= Tabs ================= */

let tab = 'tasbeeh';

function switchTab(name) {
    if (!document.getElementById(`view-${name}`)) return;
    tab = name;
    $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    setPrayerActive(name === 'prayer');
    if (name === 'adhkar') renderAdhkar();
    if (name === 'me') renderMe();
    const view = document.getElementById(`view-${name}`);
    if (view.classList.contains('scroll')) view.scrollTop = 0;
}

/* ================= Header ================= */

function renderHijri() {
    try {
        const f = new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        $('#hijriDate').textContent = f.format(new Date());
    } catch {
        $('#hijriDate').textContent = '';
    }
}

/* ================= Boot ================= */

initSheets();
applySettings();
initCounter();
initAdhkar();
initPrayer();
initMe();
initSettings();
renderHijri();

$$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
$('#goalRing').addEventListener('click', () => switchTab('me'));

on('stats', () => { if (tab === 'me') renderMe(); });
on('setting', ({ key }) => { if (key === 'tapAnywhere') renderCounter(); });

// Android back: close the top layer, then go back to the tasbeeh tab, then exit.
onBackButton(() => {
    if (handleBack()) return;
    if (tab !== 'tasbeeh') { switchTab('tasbeeh'); return; }
    exitApp();
});

// Volume keys count on the tasbeeh / focus screen, and tick the current card on the adhkar tab.
onVolumeKey(() => {
    if (anySheetOpen() || dialogOpen()) return;
    if (focusOpen() || tab === 'tasbeeh') press(null);
    else if (tab === 'adhkar') tapCurrent();
});

// Tapping a notification opens the matching screen.
onNotificationTap((id) => {
    if (id === 1) { switchTab('adhkar'); openAdhkarCategory('morning'); }
    else if (id === 2) { switchTab('adhkar'); openAdhkarCategory('evening'); }
    else if (id >= 300 && id < 400) { switchTab('adhkar'); openAdhkarCategory('prayer'); }
    else if (id >= 200 && id < 300) switchTab('prayer');
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { handleBack(); return; }
    if (anySheetOpen() || dialogOpen()) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'LI') return;
    if (tab !== 'tasbeeh' && !focusOpen()) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === '+') { e.preventDefault(); press(null); }
    else if (e.key === 'Backspace' || e.key === 'z' || e.key === 'ArrowDown') { e.preventDefault(); counterKeys.undo(); }
});

// Welcome sheet (first launch, and once after updating to 3.0).
if (!db.settings.onboarded) {
    db.settings.onboarded = true;
    save();
    setTimeout(() => openSheet('sheetWelcome'), 500);
}
$('#btnWelcomeStart').addEventListener('click', () => closeSheet('sheetWelcome'));
$('#btnWelcomeNotif').addEventListener('click', async () => {
    const ok = await ensureNotifyPermission();
    closeSheet('sheetWelcome');
    toast(ok ? 'تم تفعيل الإشعارات ✓ — اضبط التذكيرات من الإعدادات' : 'لم يتم السماح بالإشعارات');
});

// Keep date-dependent UI fresh (midnight, Hijri date).
setInterval(() => { renderHijri(); renderGoalRing(); }, 60 * 1000);

if (!isNative && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}
