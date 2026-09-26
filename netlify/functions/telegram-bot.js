// netlify/functions/telegram-bot.js
// معادل کامل ورک‌فلوی n8n: Telegram Trigger → Normalize → Get Profile → مسیریابی دکمه/پیام → AI Agent

const {
  sendMessage,
  answerCallbackQuery,
  mainMenuKeyboard,
  backToMenuKeyboard,
  profileCardKeyboard,
} = require("./lib/telegram");
const { getProfile, saveProfile, resetProfile, getMemory, saveMemory } = require("./lib/store");
const { runAgent } = require("./lib/ai");

const MENU_TEXT = "<b>منوی اصلی</b> 👇\nیکی رو انتخاب کن یا هر چیزی خواستی مستقیم برام بنویس.";
const WELCOME_TEXT = "<b>خوش اومدی 👋</b>\n\nپروفایلت آماده‌ست. از منوی زیر انتخاب کن یا هر چیزی خواستی مستقیم برام بنویس.";
const ONBOARDING_TEXT =
  "<b>سلام 👋</b>\n\nمن دستیار محتوای پیجت هستم؛ برای ایده، سناریوی ریلز، هوک، کپشن، تحلیل، تقویم و استراتژی کمکت می‌کنم.\n\nبرای شروع، یه پروفایل کوتاه بسازیم. اسم، آیدی اینستاگرام، نیچ، مخاطب هدف، لحن، هدف اصلی و محصول/خدمتت (اگه داری) رو تو یک پیام برام بفرست، یا از منوی زیر شروع کن:";

// معادل نود "Build Feature Prompt"
const FEATURE_PROMPTS = {
  generate_script: "<b>🎬 تولید سناریو</b>\n\nموضوع ریلزت رو بفرست تا برات یک سناریوی کامل بسازم.",
  generate_ideas: "<b>💡 ایده محتوا</b>\n\nبگو درباره چه موضوعی ایده می‌خوای، یا بنویس «بر اساس پیجم».",
  generate_hooks: "<b>🪝 ساخت هوک</b>\n\nموضوع یا سناریوت رو بفرست تا چند هوک متنوع برات بنویسم.",
  generate_caption: "<b>✍️ کپشن</b>\n\nمتن، موضوع یا سناریوت رو بفرست تا برات کپشن بنویسم.",
  analyze_content: "<b>🔍 تحلیل محتوا</b>\n\nکپشن/سناریو و آماری که داری (بازدید، لایک، سیو و...) رو بفرست.",
  repurpose_content: "<b>♻️ تبدیل محتوا</b>\n\nمتن یا محتوایی که می‌خوای تبدیل بشه رو بفرست و بگو به چه فرمتی.",
  content_calendar: "<b>📅 تقویم محتوا</b>\n\nبگو تقویم چند روزه می‌خوای (مثلاً ۷ یا ۳۰ روزه).",
  content_strategy: "<b>🎯 استراتژی محتوا</b>\n\nبنویس «استراتژی بده» تا بر اساس پروفایلت استراتژی کامل بچینم.",
  edit_profile: "<b>✏️ ویرایش پروفایل</b>\n\nبنویس چی رو می‌خوای تغییر بدی. مثلاً: «لحن پیجم رو رسمی‌تر کن».",
};

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// معادل نود "Build Profile Card"
function buildProfileCard(profile) {
  const hasProfile = !!(profile.niche || profile.name || profile.instagram_username);
  if (!hasProfile) {
    return "<b>👤 پروفایل محتوا</b>\n\nهنوز پروفایلی نداری. اطلاعات پیجت رو بفرست تا ذخیره کنم.";
  }
  const lines = ["<b>👤 پروفایل محتوا</b>", ""];
  const fieldLabels = {
    instagram_username: "پیج",
    name: "نام",
    niche: "نیچ",
    target_audience: "مخاطب",
    tone: "لحن",
    main_goal: "هدف",
    product_service: "محصول/خدمت",
    experience_level: "سطح تجربه",
  };
  for (const [key, label] of Object.entries(fieldLabels)) {
    if (profile[key]) lines.push(`<b>${label}:</b> ${esc(profile[key])}`);
  }
  return lines.join("\n");
}

function normalize(update) {
  const cb = update.callback_query;
  const msg = update.message;
  const isCallback = !!cb;
  const chat = isCallback ? cb.message && cb.message.chat : msg && msg.chat;
  const from = isCallback ? cb.from : msg && msg.from;
  return {
    chatId: chat ? String(chat.id) : "",
    userId: from ? String(from.id) : "",
    text: isCallback ? "" : (msg && msg.text) || "",
    isCallback,
    callbackData: isCallback ? cb.data || "" : "",
    callbackQueryId: isCallback ? cb.id || "" : "",
  };
}

async function handleCallback(norm, profile) {
  const { chatId, callbackData } = norm;

  if (callbackData === "profile") {
    return sendMessage(chatId, buildProfileCard(profile), profileCardKeyboard());
  }
  if (callbackData === "main_menu") {
    return sendMessage(chatId, MENU_TEXT, mainMenuKeyboard());
  }
  if (callbackData === "profile_reset") {
    await resetProfile(chatId, norm.userId);
    return sendMessage(chatId, "پروفایلت ریست شد ✅\n\n" + MENU_TEXT, mainMenuKeyboard());
  }

  // بقیه callback_dataها (generate_script, ..., edit_profile, repeat_last) = انتخاب یک قابلیت
  const action = callbackData === "repeat_last" ? profile.last_action || "" : callbackData;
  await saveProfile(chatId, { selected_action: action });
  const promptText = FEATURE_PROMPTS[action] || "یک گزینه از منو انتخاب کن یا درخواستت رو مستقیم بنویس.";
  return sendMessage(chatId, promptText, backToMenuKeyboard());
}

async function handleAIMessage(norm, profile) {
  const { chatId, text } = norm;
  const history = await getMemory(chatId);

  const userMessage = `${text}\n\n<active_feature>${profile.selected_action || ""}</active_feature>\n<stored_profile>${JSON.stringify(
    profile
  )}</stored_profile>`;

  const { text: replyText, savedProfile } = await runAgent(userMessage, history);

  if (savedProfile && Object.keys(savedProfile).length > 0) {
    profile = await saveProfile(chatId, savedProfile);
  }
  // معادل نود "Clear Action": فیچر فعال رو خالی کن و به‌عنوان last_action نگه دار (برای دکمه "تکرار آخرین")
  await saveProfile(chatId, {
    last_action: profile.selected_action || profile.last_action || "",
    selected_action: "",
  });

  await sendMessage(chatId, replyText || "متوجه نشدم، می‌شه دوباره بگی؟", mainMenuKeyboard());

  const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: replyText || "" }];
  await saveMemory(chatId, newHistory);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "OK" };
  }

  try {
    const update = JSON.parse(event.body);
    const norm = normalize(update);
    if (!norm.chatId) {
      return { statusCode: 200, body: "OK" };
    }

    const profile = await getProfile(norm.chatId);

    if (norm.isCallback) {
      await answerCallbackQuery(norm.callbackQueryId);
      await handleCallback(norm, profile);
    } else if (norm.text.startsWith("/start")) {
      const hasProfile = !!(profile.niche || profile.name);
      await sendMessage(norm.chatId, hasProfile ? WELCOME_TEXT : ONBOARDING_TEXT, mainMenuKeyboard());
    } else if (norm.text) {
      await handleAIMessage(norm, profile);
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("Error handling update:", err);
    return { statusCode: 200, body: "OK" }; // همیشه ۲۰۰ به تلگرام، وگرنه retry می‌کنه
  }
};
