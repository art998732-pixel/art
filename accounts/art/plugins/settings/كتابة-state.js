// ══════════════════════════════════════════════════════════════
//  كتابة-state.js — حالة مشتركة بين أمري "كتابة" و"انهاء"
// ══════════════════════════════════════════════════════════════
export const activeSessions = new Map(); // chatId → session

export const numOf   = jid => jid ? jid.split("@")[0].split(":")[0] : "";
export const display = jid => `@${numOf(jid)}`;
