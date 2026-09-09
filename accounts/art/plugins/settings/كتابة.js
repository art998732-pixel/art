// ══════════════════════════════════════════════════════════════
//  كتابة.js — لعبة الكتابة السريعة (نخبة فقط)
//  ✅ .كتابة → يبدأ جولات: يبعث كلمة أنمي، أول رد صحيح يسجل نقطة ويكمل فورًا بصمت
//  ✅ الإيقاف والنتائج بأمر .انهاء (ملف منفصل — انهاء.js)
// ══════════════════════════════════════════════════════════════

import { activeSessions } from "./كتابة-state.js";

// ── قائمة كلمات أنمي (≤5 حروف) ──────────────────────────────
const WORDS = [
    "غيو", "ميو", "ريو", "زورو", "نامي", "غون", "لوفي",
    "ماكي", "ريزي", "توجي", "يوجي", "باور", "يونا", "غوجو",
    "تيتش", "نيز", "نير", "ارثر", "سونغ", "سوهو",
    "نيجي", "ايانو", "انيا", "يور", "رين", "اثي",
    "ليفاي", "سيرا", "ريوك", "لايت", "ميسا", "فيكير",
];

const roundHeader = word => `*⧉┊[ ${word} ] 🪶*`;

const NovaUltra = {
    command:     "كتابة",
    description: "بدء لعبة الكتابة السريعة (نخبة فقط)",
    elite:       "on",
    group:       true,
    prv:         false,
    lock:        "off",
};

async function nextRound(sock, chatId) {
    const session = activeSessions.get(chatId);
    if (!session || session.stopped) return;

    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    session.currentWord = word;

    await sock.sendMessage(chatId, { text: roundHeader(word) }).catch(() => {});
}

async function execute({ sock, msg }) {
    const chatId = msg.key.remoteJid;

    if (activeSessions.has(chatId)) {
        return sock.sendMessage(chatId, {
            text: "⚠️ _فيه جولة كتابة نشطة بالفعل. اكتب .انهاء لإيقافها._",
        }, { quoted: msg });
    }

    const session = {
        stopped:     false,
        currentWord: null,
        scores:      new Map(), // senderJid خام → عدد النقاط
        listener:    null,
    };

    const listener = ({ messages }) => {
        const m = messages[0];
        if (!m?.message || m.key.remoteJid !== chatId) return;
        if (session.stopped || !session.currentWord) return;

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
        if (!text || text !== session.currentWord) return;

        const senderJid = m.key.participant || m.key.remoteJid;
        if (!senderJid) return;

        // أول رد صحيح فقط لهذي الجولة — نقفلها فورًا لمنع تسجيل ردود لاحقة بنفس الجولة
        session.currentWord = null;

        const prev = session.scores.get(senderJid) || 0;
        session.scores.set(senderJid, prev + 1);

        // يكمل بصمت — يبعث كلمة جديدة فورًا بدون أي رد تأكيد
        nextRound(sock, chatId);
    };

    session.listener = listener;
    activeSessions.set(chatId, session);
    sock.ev.on("messages.upsert", listener);

    await sock.sendMessage(chatId, {
        text: "*يلا نبلش*",
    }, { quoted: msg }).catch(() => {});

    await nextRound(sock, chatId);
}

export default { NovaUltra, execute };
