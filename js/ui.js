// Shared UI pieces: toast, celebration, bottom sheets, confirm dialog, back-button stack.
import { $, $$ } from './store.js';

let toastTimer;
export function toast(msg, ms = 2200) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function celebrate(big = false) {
    const box = $('#celebrate');
    box.innerHTML = '';
    const n = big ? 40 : 22;
    const colors = ['var(--accent)', 'var(--green)', 'var(--accent-2)'];
    for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        const a = (Math.PI * 2 * i) / n;
        const r = (big ? 150 : 110) + Math.random() * 100;
        s.style.setProperty('--dx', `${Math.cos(a) * r}px`);
        s.style.setProperty('--dy', `${Math.sin(a) * r}px`);
        s.style.animationDelay = `${Math.random() * 100}ms`;
        s.style.background = colors[i % colors.length];
        box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 1300);
}

/* ---------- Back stack (Android back button / Escape) ---------- */
const backHandlers = [];
export function pushBack(fn) { backHandlers.push(fn); }
export function popBack(fn) {
    const i = backHandlers.lastIndexOf(fn);
    if (i >= 0) backHandlers.splice(i, 1);
}
// Returns true when something was closed.
export function handleBack() {
    const fn = backHandlers.pop();
    if (fn) { fn(); return true; }
    return false;
}

/* ---------- Sheets ---------- */
const openSheets = [];
const backdrop = () => $('#backdrop');

export function openSheet(id) {
    const sheet = document.getElementById(id);
    if (openSheets.includes(sheet)) return;
    sheet.hidden = false;
    sheet.scrollTop = 0;
    sheet.style.transform = '';
    backdrop().hidden = false;
    openSheets.push(sheet);
    sheet._back = () => closeSheet(sheet, true);
    pushBack(sheet._back);
}

export function closeSheet(sheet, fromBack = false) {
    if (typeof sheet === 'string') sheet = document.getElementById(sheet);
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    const i = openSheets.indexOf(sheet);
    if (i >= 0) openSheets.splice(i, 1);
    if (!fromBack && sheet._back) popBack(sheet._back);
    if (!openSheets.length) backdrop().hidden = true;
}

export const anySheetOpen = () => openSheets.length > 0;

export function initSheets() {
    backdrop().addEventListener('click', () => {
        const top = openSheets[openSheets.length - 1];
        if (top) closeSheet(top);
    });
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

    $('#confirmYes').addEventListener('click', () => closeConfirm(true));
    $('#confirmNo').addEventListener('click', () => closeConfirm(false));
}

/* ---------- Confirm dialog ---------- */
let confirmResolve;
const confirmBack = () => closeConfirm(false, true);

export function confirmBox(text, yes = 'تأكيد') {
    $('#confirmText').textContent = text;
    $('#confirmYes').textContent = yes;
    $('#confirmDialog').hidden = false;
    pushBack(confirmBack);
    return new Promise((res) => { confirmResolve = res; });
}

function closeConfirm(v, fromBack = false) {
    $('#confirmDialog').hidden = true;
    if (!fromBack) popBack(confirmBack);
    if (confirmResolve) confirmResolve(v);
    confirmResolve = null;
}

export const dialogOpen = () => !$('#confirmDialog').hidden;
