// Thin layer over native (Capacitor / Android) features with browser fallbacks.

const Cap = window.Capacitor;
export const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());

// Capacitor exposes native plugins on window.Capacitor.Plugins; newer versions also offer registerPlugin().
const plugin = (name) => {
    if (!isNative) return null;
    if (Cap.Plugins && Cap.Plugins[name]) return Cap.Plugins[name];
    return Cap.registerPlugin ? Cap.registerPlugin(name) : null;
};
// Fire-and-forget a native call, whether it returns a promise, a value, or throws.
const fire = (fn) => { Promise.resolve().then(fn).catch(() => {}); };

const Haptics = plugin('Haptics');
const LocalNotifications = plugin('LocalNotifications');
const App = plugin('App');
const KeepAwake = plugin('KeepAwake');
const StatusBar = plugin('StatusBar');
const Share = plugin('Share');
const VolumeKeys = plugin('VolumeKeys');

/* ---------- Vibration ---------- */
const TAP_MS = { light: 12, medium: 25, heavy: 45 };
const TAP_STYLE = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };

export function vibrateTap(strength = 'medium') {
    if (Haptics) {
        fire(() => Haptics.impact({ style: TAP_STYLE[strength] || 'MEDIUM' }));
    } else if (navigator.vibrate) {
        navigator.vibrate(TAP_MS[strength] || 25);
    }
}

export function vibrateGoal() {
    const pattern = [180, 90, 180, 90, 320];
    if (Haptics) {
        // Haptics.vibrate only takes a single duration, so play the pattern manually.
        let t = 0;
        pattern.forEach((ms, i) => {
            if (i % 2 === 0) setTimeout(() => fire(() => Haptics.vibrate({ duration: ms })), t);
            t += ms;
        });
    } else if (navigator.vibrate) {
        navigator.vibrate(pattern);
    }
}

// A soft double pulse (used every 10 counts).
export function vibratePulse() {
    if (Haptics) {
        fire(() => Haptics.impact({ style: 'HEAVY' }));
        setTimeout(() => fire(() => Haptics.impact({ style: 'HEAVY' })), 120);
    } else if (navigator.vibrate) {
        navigator.vibrate([35, 70, 35]);
    }
}

/* ---------- Sound ---------- */
let audioCtx;
export function playClick(high = false) {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(high ? 880 : 520, t);
        osc.frequency.exponentialRampToValueAtTime(high ? 1320 : 380, t + (high ? 0.25 : 0.06));
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(high ? 0.25 : 0.18, t + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (high ? 0.45 : 0.08));
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.5);
    } catch { /* audio not available */ }
}

/* ---------- Keep screen awake ---------- */
let wakeLock = null;
let wantAwake = false;

export async function setKeepAwake(on) {
    wantAwake = on;
    try {
        if (KeepAwake) {
            await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
            return;
        }
        if (!('wakeLock' in navigator)) return;
        if (on && !wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        } else if (!on && wakeLock) {
            await wakeLock.release();
            wakeLock = null;
        }
    } catch { /* not allowed right now */ }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantAwake && !KeepAwake) setKeepAwake(true);
});

/* ---------- Notifications ---------- */
export const canSchedule = !!LocalNotifications;

export async function ensureNotifyPermission() {
    if (LocalNotifications) {
        try {
            let p = await LocalNotifications.checkPermissions();
            if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
            return p.display === 'granted';
        } catch { return false; }
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
}

let notifySeq = 1000;
export async function notifyNow(title, body) {
    if (LocalNotifications) {
        try {
            notifySeq = notifySeq >= 1999 ? 1000 : notifySeq + 1;
            await LocalNotifications.schedule({
                notifications: [{ id: notifySeq, title, body, smallIcon: 'ic_stat_notify', iconColor: '#D8B46A' }],
            });
            return true;
        } catch { return false; }
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
        const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
        if (reg) await reg.showNotification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', lang: 'ar', dir: 'rtl' });
        else new Notification(title, { body, icon: './icons/icon-192.png', lang: 'ar', dir: 'rtl' });
        return true;
    } catch { return false; }
}

// Notifications are grouped by id range; a group is fully replaced on every change.
//   1..99    daily reminders (morning/evening/friday/periodic)
//   200..299 prayer-time alerts, 300..399 after-prayer adhkar reminders
export async function scheduleGroup(minId, maxId, list) {
    if (!LocalNotifications) return false;
    try {
        const pending = await LocalNotifications.getPending();
        const old = pending.notifications.filter((n) => n.id >= minId && n.id < maxId).map((n) => ({ id: n.id }));
        if (old.length) await LocalNotifications.cancel({ notifications: old });
        if (!list.length) return true;
        await LocalNotifications.schedule({
            notifications: list.map((r) => ({
                id: r.id,
                title: r.title,
                body: r.body,
                smallIcon: 'ic_stat_notify',
                iconColor: '#D8B46A',
                schedule: r.at ? { at: r.at, allowWhileIdle: true } : { on: r.on, allowWhileIdle: true },
            })),
        });
        return true;
    } catch (e) {
        console.warn('scheduleGroup failed', e);
        return false;
    }
}
export const scheduleReminders = (list) => scheduleGroup(1, 100, list);

/* ---------- Share ---------- */
export async function shareText(title, text) {
    try {
        if (Share) { await Share.share({ title, text, dialogTitle: title }); return 'shared'; }
        if (navigator.share) { await navigator.share({ title, text }); return 'shared'; }
        await navigator.clipboard.writeText(text);
        return 'copied';
    } catch {
        return 'failed';
    }
}

/* ---------- Location ---------- */
export function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('unsupported')); return; }
        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (e) => reject(e),
            { enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * 60 * 1000 },
        );
    });
}

/* ---------- Volume keys (Android only) ---------- */
export const hasVolumeKeys = !!VolumeKeys;
export function setVolumeKeys(on) {
    if (VolumeKeys) fire(() => VolumeKeys.setEnabled({ enabled: !!on }));
}
export function onVolumeKey(handler) {
    if (VolumeKeys) VolumeKeys.addListener('press', (e) => handler(e && e.direction));
}

// Called with the notification id when the user taps one of our notifications.
export function onNotificationTap(handler) {
    if (LocalNotifications) {
        LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
            handler(e && e.notification ? e.notification.id : null);
        });
    }
}

/* ---------- Android back button ---------- */
export function onBackButton(handler) {
    if (App) App.addListener('backButton', handler);
}
export function exitApp() {
    if (App) fire(() => App.exitApp());
}

/* ---------- Status / navigation bar icons ---------- */
export function setBarsDark(darkBackground, color) {
    if (!StatusBar) return;
    fire(() => StatusBar.setStyle({ style: darkBackground ? 'DARK' : 'LIGHT' }));
    if (color) fire(() => StatusBar.setBackgroundColor({ color }));
}
