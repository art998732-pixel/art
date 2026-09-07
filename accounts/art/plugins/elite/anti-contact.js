// ══════════════════════════════════════════════════════════════
//  anti-contact.js — طرد أي شخص يرسل جهة اتصال (VCard) بالقروب
//  ✅ يعمل تلقائيًا بدون أمر (عبر global.messageEvHandlers)
//  ✅ يحذف الرسالة + يطرد المرسل
//  ✅ يتجاهل الأونر / الإليت / الأدمن (قابل للتعديل)
// ══════════════════════════════════════════════════════════════

const NovaUltra = {
    description: 'يطرد أي شخص يرسل جهة اتصال بالقروب',
    elite:       'off',
    group:       true,
    prv:         false,
    lock:        'off',
};

// ⚙️ إعدادات قابلة للتعديل
const EXEMPT_OWNER = true;   // الأونر معفي دائمًا
const EXEMPT_ADMINS = true;  // أدمنية القروب معفيون
const DELETE_MSG = true;     // يحذف رسالة جهة الاتصال
const KICK_USER  = true;     // يطرد المرسل

function isContactMessage(msg) {
    const m = msg.message;
    if (!m) return false;
    return !!(m.contactMessage || m.contactsArrayMessage);
}

async function handler(sock, msg) {
    try {
        const chatId = msg.key.remoteJid;
        if (!chatId?.endsWith('@g.us')) return;      // القروبات فقط

        const contactDetected = isContactMessage(msg);
        if (!contactDetected) return;

        console.log('[anti-contact] ✅ تم رصد جهة اتصال — جاري المعالجة...');

        // معرّف الحذف: يجب أن يكون بنفس الصيغة الخام تمامًا كما وصل من واتساب (قد تكون @lid أو @s.whatsapp.net)
        const deleteParticipant = msg.key.fromMe
            ? undefined // رسائل fromMe لا تحتاج participant عند الحذف
            : (msg.key.participant || msg.key.participantAlt || chatId);

        // معرّف الفحص (owner/admin): نستخدم نفس القيمة الخام، ونطبّعه فقط للمقارنة النصية
        const senderJid = deleteParticipant || (sock.user?.id ? (sock.user.id.split(':')[0] + '@s.whatsapp.net') : chatId);

        // إذا كان المعرّف بصيغة @lid، نحاول إيجاد المعادل الحقيقي (@s.whatsapp.net) من بيانات القروب
        let resolvedDeleteParticipant = deleteParticipant;
        if (deleteParticipant?.endsWith('@lid')) {
            try {
                const meta = await sock.groupMetadata(chatId);
                const match = meta.participants.find(p => p.id === deleteParticipant || p.lid === deleteParticipant);
                if (match) {
                    // بعض إصدارات Baileys تخزن الرقم الحقيقي في jid/id بينما lid هو الحقل البديل
                    resolvedDeleteParticipant = match.jid || (match.id?.endsWith('@s.whatsapp.net') ? match.id : deleteParticipant);
                    console.log('[anti-contact] تحويل @lid إلى:', resolvedDeleteParticipant);
                }
            } catch (e) {
                console.log('[anti-contact] فشل تحويل @lid:', e?.message);
            }
        }

        // معرفة الأونر
        let ownerNumber = '';
        try {
            const { default: configImport } = await import('../nova/config.js');
            ownerNumber = configImport.owner ? configImport.owner.toString().replace(/\D/g, '') : '';
        } catch (e) {}
        const senderPure = senderJid.split('@')[0].split(':')[0];
        const isOwner = ownerNumber && senderPure === ownerNumber;

        // معرفة إذا المرسل أدمن بالقروب (لأجل استثناء الطرد فقط)
        let senderIsAdmin = false;
        if (EXEMPT_ADMINS) {
            try {
                const meta = await sock.groupMetadata(chatId);
                const participant = meta.participants.find(p =>
                    (p.id === senderJid) || (p.id?.split('@')[0] === senderPure)
                );
                senderIsAdmin = !!participant?.admin;
            } catch (e) {}
        }

        const isExemptFromKick = (EXEMPT_OWNER && isOwner) || senderIsAdmin;

        // ── الحذف يصير دائمًا، للجميع بلا أي استثناء (حتى رسائل نفس حساب البوت) ──
        if (DELETE_MSG) {
            console.log('[anti-contact] محاولة حذف الرسالة | fromMe:', msg.key.fromMe === true, '| participant:', resolvedDeleteParticipant);
            const deletePayload = {
                remoteJid: chatId,
                id: msg.key.id,
                fromMe: msg.key.fromMe === true,
            };
            if (resolvedDeleteParticipant) deletePayload.participant = resolvedDeleteParticipant;

            try {
                const delRes = await sock.sendMessage(chatId, { delete: deletePayload });
                console.log('[anti-contact] ✅ نتيجة طلب الحذف:', JSON.stringify(delRes)?.slice(0, 200));
            } catch (delErr) {
                console.error('[anti-contact/delete] ❌ فشل الحذف (محاولة 1):', delErr?.message);

                // محاولة احتياطية: نجرب بدون participant إن كانت موجودة، أو مع الصيغة الخام الأصلية
                try {
                    const fallbackPayload = { remoteJid: chatId, id: msg.key.id, fromMe: msg.key.fromMe === true };
                    if (deleteParticipant && deleteParticipant !== resolvedDeleteParticipant) {
                        fallbackPayload.participant = deleteParticipant;
                    }
                    await sock.sendMessage(chatId, { delete: fallbackPayload });
                    console.log('[anti-contact] ✅ نجح الحذف بالمحاولة الاحتياطية');
                } catch (delErr2) {
                    console.error('[anti-contact/delete] ❌ فشلت المحاولة الاحتياطية أيضًا:', delErr2?.message);
                }
            }
        }

        // إذا المرسل مستثنى من الطرد (أونر/أدمن) → توقف هنا بعد الحذف
        if (isExemptFromKick) return;

        // تأكد أن البوت أدمن قبل محاولة الطرد
        let botIsAdmin = false;
        try {
            const meta = await sock.groupMetadata(chatId);
            const botJid = (sock.user.id.split(':')[0]) + '@s.whatsapp.net';
            const botParticipant = meta.participants.find(p => p.id?.split('@')[0] === botJid.split('@')[0]);
            botIsAdmin = !!botParticipant?.admin;
        } catch (e) {}

        if (!botIsAdmin) {
            // البوت مو أدمن، ما يقدر يطرد — يكتفي بتنبيه اختياري
            await sock.sendMessage(chatId, {
                text: '⚠️ تم حذف جهة الاتصال، لكن البوت ليس أدمن ليتمكن من الطرد.',
            }).catch(() => {});
            return;
        }

        // طرد المرسل (نستخدم المعرّف المحوَّل إن وُجد لضمان توافقه مع groupParticipantsUpdate)
        const kickTarget = resolvedDeleteParticipant || senderJid;
        if (KICK_USER) {
            try {
                const kickRes = await sock.groupParticipantsUpdate(chatId, [kickTarget], 'remove');
                console.log('[anti-contact] نتيجة الطرد:', JSON.stringify(kickRes)?.slice(0, 200));
            } catch (kickErr) {
                console.error('[anti-contact/kick] ❌ فشل الطرد:', kickErr?.message);
            }
        }

        await sock.sendMessage(chatId, {
            text: `🚫 تم طرد @${senderPure} لإرساله جهة اتصال.`,
            mentions: [kickTarget],
        }).catch(() => {});

    } catch (err) {
        console.error('[anti-contact]', err?.message);
    }
}

// تسجيل الهاندلر تلقائيًا عند تحميل البلوجن (يصمد أمام إعادة التحميل عبر أمر "حدث")
if (!global.messageEvHandlers) global.messageEvHandlers = [];
// إزالة أي نسخة قديمة من نفس البلوجن (تحمل نفس العلامة) قبل التسجيل من جديد
global.messageEvHandlers = global.messageEvHandlers.filter(h => h.__pluginTag !== 'anti-contact');
handler.__pluginTag = 'anti-contact';
global.messageEvHandlers.push(handler);
console.log('[anti-contact] 🟢 تم تسجيل الهاندلر — العدد الحالي:', global.messageEvHandlers.length);

// execute فاضي لأن هذا البلوجن بلا أمر — يعمل كحدث فقط
async function execute() {}

export default { NovaUltra, execute };
