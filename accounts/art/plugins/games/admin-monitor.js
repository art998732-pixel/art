// ========== مراقب صلاحيات المشرفين ==========

import chalk from 'chalk';

if (!global.groupEvHandlers) global.groupEvHandlers = [];

const NOTIFY_JID = "120363410244827379@g.us";

const HANDLER_ID = "__adminMonitor__";
if (!global[HANDLER_ID]) {
    global[HANDLER_ID] = true;

    global.groupEvHandlers.push(async (sock, update) => {
        try {
            console.log(chalk.bgYellow.black(" [ADMIN MONITOR] "), "update:", JSON.stringify(update));

            const { participants, action, author, id: groupId } = update;

            if (action !== "promote" && action !== "demote") {
                console.log(chalk.gray(`[ADMIN MONITOR] action ignored: ${action}`));
                return;
            }

            const BOT_JID = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";

            // ✅ author قد يكون object أو string أو null
            const authorRaw = typeof author === "object"
                ? (author?.phoneNumber || author?.id || "غير معروف")
                : (author || "غير معروف");

            // جلب اسم الجروب + رابطه + حل lid للـ author
            let groupName = groupId;
            let groupLink = groupId;
            let authorPn  = authorRaw;

            try {
                const metadata = await sock.groupMetadata(groupId);
                groupName = metadata.subject || groupId;

                // ✅ جرب جلب الرابط — لو البوت مشرف يشتغل، لو لا يجرب inviteInfo
                let inviteCode = null;
                try {
                    inviteCode = await sock.groupInviteCode(groupId);
                } catch {
                    // البوت مش مشرف — جرب groupInviteInfo كبديل
                    try {
                        const info = await sock.groupInviteInfo(groupId);
                        inviteCode = info?.inviteCode || null;
                    } catch {}
                }

                // لو فشل كل شي — ابني الرابط من الـ ID مباشرة
                if (inviteCode) {
                    groupLink = `https://chat.whatsapp.com/${inviteCode}`;
                } else {
                    // تنسيق الـ ID كرابط مقروء
                    const shortId = groupId.replace("@g.us", "");
                    groupLink = `https://chat.whatsapp.com/invite/${shortId}`;
                }

                // لو author جاء @lid — دور عليه في participants
                if (authorRaw.endsWith("@lid")) {
                    const found = metadata.participants?.find(p =>
                        p.id === authorRaw || p.lidJid === authorRaw
                    );
                    if (found?.id && found.id.endsWith("@s.whatsapp.net")) {
                        authorPn = found.id;
                    } else if (found?.phoneNumber) {
                        authorPn = found.phoneNumber;
                    }
                }
            } catch {}

            const authorNum = authorPn.split("@")[0];

            // لو البوت هو المنفذ → تجاهل
            if (authorNum === BOT_JID.split("@")[0]) return;

            const isPromote  = action === "promote";
            const emoji      = isPromote ? "⬆️" : "⬇️";
            const actionText = isPromote ? "تمت ترقيته مشرفاً" : "تم سحب إشرافه";
            const label      = isPromote ? "🟢 ترقية مشرف" : "🔴 إزالة إشراف";

            for (const target of participants) {
                // ✅ target قد يكون object أو string
                const targetPn = typeof target === "object"
                    ? (target?.phoneNumber || target?.id || "")
                    : target;

                const targetNum = targetPn.split("@")[0];

                // ✅ mentions لازم تكون @s.whatsapp.net فقط — ما يقبل @lid
                const toMention = (jid) => {
                    if (!jid || jid === "غير معروف") return null;
                    if (jid.endsWith("@s.whatsapp.net")) return jid;
                    if (jid.endsWith("@lid")) return null; // تجاهل lid
                    return null;
                };

                const mentions = [toMention(targetPn), toMention(authorPn)].filter(Boolean);

                const msgText =
`${emoji} ${label}

🏷️ الجروب  : ${groupName}
👤 العضو   : @${targetNum}  ← ${actionText}
🧩 المنفّذ  : @${authorNum}
🕐 الوقت   : ${new Date().toLocaleString('ar-DZ', { hour12: false })}

🌿 .ৎ˚₊‧ *⏤͟͟͞͞✧⸾ ⁽ 🜸 ₎ رابــط الجـروب 🗞️𓏲 ࣪₊*
\`\`\`『 ${groupLink} 』\`\`\``;

                console.log(chalk.green(`[ADMIN MONITOR] sending... mentions: ${JSON.stringify(mentions)}`));

                await sock.sendMessage(NOTIFY_JID, {
                    text: msgText,
                    mentions
                });

                console.log(chalk.green(`[ADMIN MONITOR] ✅ sent!`));
            }

        } catch (err) {
            console.error(chalk.red("[ADMIN MONITOR ERROR]"), err?.message, err?.stack);
        }
    });

    console.log(chalk.green("✅ [ADMIN MONITOR] registered successfully"));
}

export default {
    NovaUltra: {
        command: "مراقب",
        description: "يعرض حالة مراقبة صلاحيات المشرفين",
        elite: "on",
    },
    execute: async ({ sock, msg }) => {
        const chatId = msg.key.remoteJid;
        const count  = global.groupEvHandlers?.length ?? 0;
        await sock.sendMessage(chatId, {
            text:
`📡 مراقب الصلاحيات

✅ ترقية المشرفين : مفعّل
✅ إزالة المشرفين : مفعّل
📋 معالجات مسجّلة : ${count}
🔔 الإشعارات تذهب لـ : ${NOTIFY_JID}`,
        }, { quoted: msg });
    }
};
