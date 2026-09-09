// ══════════════════════════════════════════════════════════════
//  انهاء.js — إنهاء جولة الكتابة وعرض النتائج (نخبة فقط)
//  ✅ يوقف الجلسة النشطة من كتابة.js ويعرض ترتيب النقاط
//  ✅ منشن دقيق لكل شخص برقمه (بنفس نمط أمر "غزو" الناجح)
// ══════════════════════════════════════════════════════════════

import { activeSessions, display } from "./كتابة-state.js";

const NovaUltra = {
    command:     "انهاء",
    description: "إنهاء جولة الكتابة وعرض النتائج (نخبة فقط)",
    elite:       "on",
    group:       true,
    prv:         false,
    lock:        "off",
};

async function execute({ sock, msg }) {
    const chatId = msg.key.remoteJid;
    const session = activeSessions.get(chatId);

    if (!session) {
        return sock.sendMessage(chatId, {
            text: "❌ _لا توجد جولة كتابة نشطة._",
        }, { quoted: msg });
    }

    session.stopped = true;
    sock.ev.off("messages.upsert", session.listener);
    activeSessions.delete(chatId);

    const ranking = [...session.scores.entries()].sort((a, b) => b[1] - a[1]);

    if (ranking.length === 0) {
        return sock.sendMessage(chatId, {
            text: "🪶 *انتهت الجولة!*\n_لا توجد نتائج، ما رد أحد._",
        }, { quoted: msg });
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = ranking.map(([jid, pts], i) => {
        const medal = medals[i] || "🎗️";
        const stars = " ".repeat(Math.min(pts, 5));
        return `${medal} ${display(jid)} ┊ *${pts}* نقطة ${stars}`;
    });

    const mentions = ranking.map(([jid]) => jid);

    const resultText =
`*◈─────⋆⋅☆⋅⋆─────◈*
    \`فـعـالـيـة الـكـتـابـة \`
*◈─────⋆⋅☆⋅⋆─────◈*

${lines.join("\n")}
`;

    await sock.sendMessage(chatId, {
        text: resultText,
        mentions,
    }, { quoted: msg }).catch(() => {});
}

export default { NovaUltra, execute };
