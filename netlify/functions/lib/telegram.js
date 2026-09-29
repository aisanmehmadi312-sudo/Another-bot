// lib/telegram.js — توابع کمکی برای ارتباط با API تلگرام

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

async function tgCall(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function sendMessage(chatId, text, replyMarkup) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

// برای فوروارد کردن عکس رسید به ادمین همراه با دکمه تایید
function sendPhoto(chatId, fileId, caption, replyMarkup) {
  return tgCall("sendPhoto", {
    chat_id: chatId,
    photo: fileId,
    caption,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
}

function answerCallbackQuery(callbackQueryId, text) {
  if (!callbackQueryId) return Promise.resolve();
  return tgCall("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

// دکمه‌های منوی اصلی — یک‌بار تعریف، همه‌جا استفاده می‌شه (به‌جای تکرار در ۳ پیام مختلف مثل ورک‌فلوی اصلی)
const MAIN_MENU_ROWS = [
  [
    { text: "🎬 تولید سناریو", callback_data: "generate_script" },
    { text: "💡 ایده محتوا", callback_data: "generate_ideas" },
  ],
  [
    { text: "🪝 ساخت هوک", callback_data: "generate_hooks" },
    { text: "✍️ کپشن", callback_data: "generate_caption" },
  ],
  [
    { text: "🔍 تحلیل محتوا", callback_data: "analyze_content" },
    { text: "♻️ تبدیل محتوا", callback_data: "repurpose_content" },
  ],
  [
    { text: "📅 تقویم محتوا", callback_data: "content_calendar" },
    { text: "🎯 استراتژی", callback_data: "content_strategy" },
  ],
  [{ text: "👤 پروفایل من", callback_data: "profile" }],
];

function mainMenuKeyboard() {
  return { inline_keyboard: MAIN_MENU_ROWS };
}

function backToMenuKeyboard() {
  return { inline_keyboard: [[{ text: "⬅️ بازگشت به منو", callback_data: "main_menu" }]] };
}

function profileCardKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✏️ ویرایش پروفایل", callback_data: "edit_profile" },
        { text: "🔄 ریست پروفایل", callback_data: "profile_reset" },
      ],
      [{ text: "⬅️ بازگشت به منو", callback_data: "main_menu" }],
    ],
  };
}

function buySubscriptionKeyboard() {
  return { inline_keyboard: [[{ text: "💳 تهیه اشتراک", callback_data: "buy_subscription" }]] };
}

// برای پیام ادمین؛ chatId همون کاربری‌ه که باید تاییدش فعال بشه
function confirmPaymentKeyboard(userChatId) {
  return { inline_keyboard: [[{ text: "✅ تایید و فعال‌سازی اشتراک", callback_data: `confirm_payment:${userChatId}` }]] };
}

module.exports = {
  sendMessage,
  sendPhoto,
  answerCallbackQuery,
  mainMenuKeyboard,
  backToMenuKeyboard,
  profileCardKeyboard,
  buySubscriptionKeyboard,
  confirmPaymentKeyboard,
};
