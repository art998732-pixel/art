// ══════════════════════════════════════════════════════════════
//  anti-contact.js — يحذف أي رسالة "جهة اتصال" ويطرد مرسلها بالقروب
//  ✅ يعمل تلقائيًا بدون أمر (عبر global.messageEvHandlers)
//  ✅ الحذف يشمل الجميع بلا استثناء (حتى الأونر/الأدمن)
//  ✅ الطرد مستثنى للأونر والأدمنية فقط
//  ✅ طرد مباشر بدون فحص مسبق لصلاحية البوت (بنفس أسلوب أمر "طير" الناجح) — أسرع وأبسط
// ══════════════════════════════════════════════════════════════

const NovaUltra = {
    description: 'يحذف رسائل جهات الاتصال ويطرد مرسلها (عدا الأونر/الأدمن)',
    elite:       'off',
    group:       true,
    prv:         false,
    lock:        'off',
};

// ⚙️ إعدادات قابلة للتعديل
const EXEMPT_OWNER  = true;  // الأونر معفي من الطرد فقط (الحذف يشمله دائمًا)
const EXEMPT_ADMINS = true;  // أدمنية القروب معفيون من الطرد فقط (الحذف يشملهم دائمًا)

function isContactMessage(msg) {
    const m = msg.message;
    return !!(m && (m.contactMessage || m.contactsArrayMessage));
}

async function handler(sock, msg) {
    if (!isContactMessage(msg)) return;
    const t0 = Date.now();

    const chatId = msg.key.remoteJid;
    if (!chatId?.endsWith('@g.us')) return; // القروبات فقط

    // معرّف المرسل الخام — نفس القيمة كما وصلت من واتساب (يُستخدم مباشرة للحذف والطرد، بدون أي تحويل يدوي)
    const senderRaw = msg.key.fromMe ? sock.user.id : (msg.key.participant || msg.key.participantAlt || chatId);
    const senderPure = senderRaw.split('@')[0].split(':')[0];

    // ── الحذف: يصير فورًا وللجميع بلا أي استثناء ──
    sock.sendMessage(chatId, {
        delete: { remoteJid: chatId, id: msg.key.id, participant: senderRaw, fromMe: msg.key.fromMe === true },
    }).then(() => {
        console.log(`[anti-contact] ⏱ زمن إرسال طلب الحذف: ${Date.now() - t0}ms`);
    }).catch(() => {});

    // ── تحديد الاستثناء من الطرد (أونر / أدمن) ──
    let isExempt = false;
    try {
        let ownerNumber = '';
        try {
            const { default: configImport } = await import('../nova/config.js');
            ownerNumber = configImport.owner ? configImport.owner.toString().replace(/\D/g, '') : '';
        } catch (e) {}

        if (EXEMPT_OWNER && ownerNumber && senderPure === ownerNumber) {
            isExempt = true;
        } else if (EXEMPT_ADMINS) {
            const meta = await sock.groupMetadata(chatId);
            const participant = meta.participants.find(p => p.id.split('@')[0] === senderPure || p.id === senderRaw);
            if (participant?.admin) isExempt = true;
        }
    } catch (e) {}

    if (isExempt) return;

    // ── الطرد: مباشر بدون فحص مسبق لصلاحية البوت — إذا نجح يكمل، إذا فشل يبقى صامت ──
    try {
        await sock.groupParticipantsUpdate(chatId, [senderRaw], "remove");
    } catch (err) {
        // البوت غالبًا ليس أدمن أو خطأ مؤقت — نتجاهل بصمت بنفس أسلوب أمر "طير"
        if (String(err).includes('401') || String(err).includes('not a group admin')) {
            console.log('[anti-contact] ⚠️ البوت ليس مشرفاً لطرد العضو.');
        }
    }
}

// تسجيل الهاندلر تلقائيًا عند تحميل البلوجن (يصمد أمام إعادة التحميل عبر أمر "حدث")
if (!global.messageEvHandlers) global.messageEvHandlers = [];
global.messageEvHandlers = global.messageEvHandlers.filter(h => h.__pluginTag !== 'anti-contact');
handler.__pluginTag = 'anti-contact';
global.messageEvHandlers.push(handler);

// execute فاضي لأن هذا البلوجن بلا أمر — يعمل كحدث فقط عبر global.messageEvHandlers
async function execute() {}

export default { NovaUltra, execute };
