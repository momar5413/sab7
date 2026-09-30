// Prayer tab: prayer times (offline, adhan-js), prayer notifications and Qibla compass.
import { Coordinates, CalculationMethod, PrayerTimes, Madhab, HighLatitudeRule, Qibla } from './vendor/adhan.js';
import { db, save, $, fmt, escapeHtml, on } from './store.js';
import { CITIES, METHODS, PRAYERS } from './data.js';
import { canSchedule, ensureNotifyPermission, scheduleGroup, getPosition, vibrateGoal } from './platform.js';
import { toast, openSheet, closeSheet } from './ui.js';

const KAABA = { lat: 21.4225, lng: 39.8262 };
const FIVE = PRAYERS.filter((p) => p.key !== 'sunrise');

let active = false;
let tickTimer = null;

const coords = () => new Coordinates(db.settings.location.lat, db.settings.location.lng);

function params(c) {
    const factory = CalculationMethod[db.settings.calcMethod] || CalculationMethod.MuslimWorldLeague;
    const p = factory();
    p.madhab = db.settings.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
    p.highLatitudeRule = HighLatitudeRule.recommended(c);
    return p;
}

function timesFor(date) {
    const c = coords();
    return new PrayerTimes(c, date, params(c));
}

export function fmtTime(d) {
    let h = d.getHours();
    const m = d.getMinutes();
    const ap = h < 12 ? 'ص' : 'م';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

function nextPrayer(now = new Date()) {
    const today = timesFor(now);
    for (const p of FIVE) if (today[p.key] > now) return { ...p, at: today[p.key], today };
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const t = timesFor(tomorrow);
    return { ...FIVE[0], at: t.fajr, today };
}

function countdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/* ================= Rendering ================= */

function renderTimes() {
    const now = new Date();
    const np = nextPrayer(now);
    $('#npName').textContent = np.name;
    $('#npTime').textContent = fmtTime(np.at);
    $('#npCountdown').textContent = `بعد ${countdown(np.at - now)}`;

    const t = np.today;
    let current = null;
    for (const p of FIVE) if (t[p.key] <= now) current = p.key;
    $('#prayerTimes').innerHTML = PRAYERS.map((p) => {
        const cls = [p.key === np.key && np.at.getDate() === now.getDate() ? 'next' : '', p.key === current ? 'current' : '', p.key === 'sunrise' ? 'sun' : '']
            .filter(Boolean).join(' ');
        return `<li class="${cls}"><span>${p.name}</span><b>${fmtTime(t[p.key])}</b></li>`;
    }).join('');
}

export function renderPrayer() {
    const loc = db.settings.location;
    $('#noLocation').hidden = !!loc;
    $('#prayerContent').hidden = !loc;
    if (!loc) return;
    $('#locName').textContent = loc.name;
    $('#methodSelect').value = db.settings.calcMethod;
    $('#prayerNote').textContent = canSchedule
        ? 'تُجدول التنبيهات لـ 10 أيام، وتتجدد تلقائيًا كلما فتحت التطبيق.'
        : 'تنبيهات الصلاة تعمل في تطبيق أندرويد (APK).';
    renderTimes();
    renderQiblaInfo();
}

/* ================= Notifications ================= */

export async function syncPrayerNotifications(userAction = false) {
    if (!canSchedule) {
        if (userAction && (db.settings.prayerNotify || db.settings.afterPrayerNotify)) toast('تنبيهات الصلاة تعمل في تطبيق أندرويد');
        return;
    }
    const s = db.settings;
    const list = [];
    if (s.location && (s.prayerNotify || s.afterPrayerNotify)) {
        if (userAction && !(await ensureNotifyPermission())) {
            toast('يرجى السماح بالإشعارات من إعدادات الهاتف');
            return;
        }
        const now = Date.now();
        for (let d = 0; d < 10; d++) {
            const date = new Date();
            date.setDate(date.getDate() + d);
            const t = timesFor(date);
            FIVE.forEach((p, i) => {
                const at = t[p.key];
                if (s.prayerNotify && at.getTime() > now) {
                    list.push({ id: 200 + d * 5 + i, title: `حان الآن وقت صلاة ${p.name} 🕌`, body: `${s.location.name} — ${fmtTime(at)}`, at });
                }
                const after = new Date(at.getTime() + 10 * 60 * 1000);
                if (s.afterPrayerNotify && after.getTime() > now) {
                    list.push({ id: 300 + d * 5 + i, title: 'أذكار ما بعد الصلاة 📿', body: `لا تنسَ أذكار ما بعد صلاة ${p.name}`, at: after });
                }
            });
        }
    }
    const ok = await scheduleGroup(200, 400, list);
    if (userAction && ok && list.length) toast('تم ضبط تنبيهات الصلاة ✓');
}

/* ================= Location ================= */

function setLocation(loc, method) {
    db.settings.location = loc;
    if (method) db.settings.calcMethod = method;
    save();
    renderPrayer();
    if (active) setPrayerActive(true);
    syncPrayerNotifications(false);
    toast(`تم تحديد الموقع: ${loc.name}`);
}

async function useGps() {
    toast('جارٍ تحديد موقعك...', 8000);
    try {
        const p = await getPosition();
        closeSheet('sheetCity');
        setLocation({ lat: p.lat, lng: p.lng, name: `موقعي (${p.lat.toFixed(2)}, ${p.lng.toFixed(2)})` });
    } catch (e) {
        toast(e && e.code === 1 ? 'لم يتم السماح بالوصول للموقع — اختر مدينتك من القائمة' : 'تعذر تحديد الموقع — اختر مدينتك من القائمة', 3500);
        openCitySheet();
    }
}

function renderCities(q = '') {
    const term = q.trim();
    $('#cityList').innerHTML = CITIES
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => !term || c[0].includes(term))
        .map(({ c, i }) => `<li><button data-city="${i}"><span>${escapeHtml(c[0])}</span><small>${METHODS.find((m) => m.id === c[3]).name}</small></button></li>`)
        .join('') || '<li class="muted center small">لا توجد نتائج</li>';
}

function openCitySheet() {
    $('#citySearch').value = '';
    renderCities();
    openSheet('sheetCity');
}

/* ================= Qibla ================= */

let qiblaDeg = 0;
let heading = null;
let dialAngle = 0;
let aligned = false;
let sawCompass = false;
let compassTimer = null;

function distanceKm(a, b) {
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function renderQiblaInfo() {
    const loc = db.settings.location;
    qiblaDeg = Qibla(coords());
    $('#kaabaNeedle').style.transform = `rotate(${qiblaDeg}deg)`;
    const km = Math.round(distanceKm(loc, KAABA));
    $('#qiblaDeg').textContent = `${Math.round(qiblaDeg)}° من الشمال · ${fmt(km)} كم إلى مكة`;
    updateCompassStatus();
}

function updateCompassStatus() {
    const st = $('#qiblaStatus');
    if (heading === null) {
        st.textContent = sawCompass || !active
            ? 'ضع الهاتف بشكل أفقي بعيدًا عن المعادن'
            : 'جارٍ تشغيل البوصلة...';
        return;
    }
    st.textContent = aligned ? '✓ أنت الآن باتجاه القبلة' : 'أدر الهاتف حتى تصبح الكعبة في الأعلى';
}

function onOrientation(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if ((e.absolute || e.type === 'deviceorientationabsolute') && typeof e.alpha === 'number') h = 360 - e.alpha;
    if (h === null || Number.isNaN(h)) return;
    sawCompass = true;
    heading = h;
    // Rotate along the shortest path to avoid spinning around at 0/360.
    const target = -h;
    let delta = ((target - dialAngle) % 360 + 540) % 360 - 180;
    dialAngle += delta * 0.35;
    $('#dial').style.transform = `rotate(${dialAngle}deg)`;
    const diff = Math.abs(((qiblaDeg - h) % 360 + 540) % 360 - 180);
    const nowAligned = diff < 5;
    if (nowAligned && !aligned && db.settings.vibrateGoal) vibrateGoal();
    aligned = nowAligned;
    $('#compass').classList.toggle('aligned', aligned);
    updateCompassStatus();
}

function startCompass() {
    heading = null;
    window.addEventListener('deviceorientationabsolute', onOrientation);
    window.addEventListener('deviceorientation', onOrientation);
    clearTimeout(compassTimer);
    compassTimer = setTimeout(() => {
        if (heading === null) {
            $('#qiblaStatus').textContent = 'البوصلة غير متاحة على هذا الجهاز — استخدم الزاوية المكتوبة من جهة الشمال';
        }
    }, 3000);
    updateCompassStatus();
}

function stopCompass() {
    window.removeEventListener('deviceorientationabsolute', onOrientation);
    window.removeEventListener('deviceorientation', onOrientation);
    clearTimeout(compassTimer);
}

/* ================= Lifecycle ================= */

export function setPrayerActive(on) {
    active = on;
    clearInterval(tickTimer);
    if (on) {
        renderPrayer();
        if (db.settings.location) {
            tickTimer = setInterval(renderTimes, 1000);
            startCompass();
        }
    } else {
        stopCompass();
    }
}

export function initPrayer() {
    $('#methodSelect').innerHTML = METHODS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
    $('#methodSelect').addEventListener('change', (e) => {
        db.settings.calcMethod = e.target.value;
        save();
        renderPrayer();
        syncPrayerNotifications(false);
    });
    $('#btnGps').addEventListener('click', useGps);
    $('#btnGps2').addEventListener('click', useGps);
    $('#btnCity').addEventListener('click', openCitySheet);
    $('#locLine').addEventListener('click', openCitySheet);
    $('#citySearch').addEventListener('input', (e) => renderCities(e.target.value));
    $('#cityList').addEventListener('click', (e) => {
        const b = e.target.closest('[data-city]');
        if (!b) return;
        const [name, lat, lng, method] = CITIES[Number(b.dataset.city)];
        closeSheet('sheetCity');
        setLocation({ lat, lng, name }, method);
    });

    on('setting', ({ key }) => {
        if (key === 'madhab') { renderPrayer(); syncPrayerNotifications(false); }
        if (key === 'prayerNotify' || key === 'afterPrayerNotify') syncPrayerNotifications(true);
    });

    // Keep the next 10 days of alerts scheduled.
    if (db.settings.location) syncPrayerNotifications(false);
}
