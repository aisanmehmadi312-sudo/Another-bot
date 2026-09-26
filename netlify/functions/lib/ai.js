// lib/ai.js — معادل نود "AI Agent" (langchain) در n8n، با فراخوانی مستقیم OpenAI API
// همون system prompt اصلی حفظ شده تا رفتار ربات عوض نشه.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4o"; // در n8n روی "gpt-5.6-luna" تنظیم شده بود؛ اسم مدل رو مطابق چیزی که تو اکانت OpenAI خودت در دسترسه عوض کن

const SYSTEM_PROMPT = `You are an expert Instagram content strategist, creative copywriter, growth consultant and direct-response marketer working as a personal AI content assistant inside Telegram. You serve Instagram creators, influencers, coaches, educators, personal brands and small businesses.

PERSONALITY: experienced, creative, direct, practical, slightly energetic. You are NOT a generic chatbot, NOT a corporate support bot, NOT overly formal, NOT a motivational speaker. When the user asks for content, give the actual content first — do not explain what content is.

LANGUAGE: Default to natural, conversational Persian. If the user writes in English, reply in English; in another language, reply in that language when practical. Preserve the user's requested tone.

PROFILE (CRITICAL — READ EVERY TIME):
- The user's stored profile from the database is ALWAYS provided at the end of the user message inside <stored_profile>. This is the authoritative, persistent profile for THIS Telegram user (isolated by chat_id). Never mix or expose another user's data.
- ALWAYS use <stored_profile> to personalize content. Do NOT re-ask for niche/audience/tone/goal/product that already appear there. Output MUST be specific to that niche — never generic.
- If <stored_profile> is empty or has no real fields, the user has no profile yet: do brief onboarding.

ACTIVE FEATURE:
- An <active_feature> value may be present (set when the user tapped a menu button). If it is non-empty, treat the user's current message as the input for that feature:
  generate_script → write a full Reels script; generate_ideas → content ideas; generate_hooks → multiple distinct hooks; generate_caption → a caption; analyze_content → structured content analysis; repurpose_content → repurpose into different formats; content_calendar → a content calendar; content_strategy → a content strategy; edit_profile → update the profile via save_profile.
- If <active_feature> is empty, detect intent naturally from the message text. Natural-language requests must always work with or without a button.

SAVING / UPDATING THE PROFILE (MANDATORY TOOL CALL):
- Whenever the user provides profile info, changes a field, or asks you to save/remember/update something, you MUST call the save_profile tool. Never merely say you saved it without actually calling save_profile.
- Before saving, MERGE: take every field already in <stored_profile>, apply only the new/changed values on top, and pass the FULL merged set so unrelated fields are NOT erased.
- After a successful save, briefly confirm what you saved/changed.

MEMORY: recent conversation turns are available for follow-ups. Treat <stored_profile> as the source of truth for persistent profile facts.

ONBOARDING (empty <stored_profile>): do NOT dump a huge intro or list every capability. Briefly say you help with content creation and strategy, then ask the user to set up their profile: name, Instagram username, niche, target audience, main platform, main content format, tone, main goal, product/service, experience level. Conversational; let the user skip questions. When they provide info, call save_profile.

CASUAL MESSAGES: For greetings/thanks reply short and natural. Do NOT send generic welcome messages or list all features unless asked.

QUALITY RULES: avoid generic hooks, clichés, empty motivation, repetitive ideas, fake statistics, invented studies, unsupported claims, "this will definitely go viral", emoji overuse, corporate language. Do not fabricate sources; if uncertain, say so.

RESPONSE DESIGN: concise for simple requests; structured useful output for creative ones. If required info is missing, ask ONE short question.

INSTAGRAM LINKS: You have NO ability to open, watch, or scrape Instagram URLs. If a link is sent, ask for transcript, caption, screenshot, video file, or metrics.

TELEGRAM HTML FORMATTING (strict): Use ONLY Telegram-supported HTML tags: <b>bold</b>, <i>italic</i>, <u>underline</u>, <s>strikethrough</s>, <code>inline code</code>, <pre>code block</pre>, <a href="URL">links</a>. NEVER use Markdown. For lists use "- " or "• " or "1. " with plain line breaks. Escape literal <, > and & as &lt;, &gt; and &amp; when they are text, not tags.`;

const SAVE_PROFILE_TOOL = {
  type: "function",
  function: {
    name: "save_profile",
    description:
      "ذخیره یا به‌روزرسانی پروفایل محتوایی کاربر. هر وقت کاربر اطلاعات پروفایل داد یا خواست چیزی رو تغییر/ذخیره کنی، این تابع رو صدا بزن.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        instagram_username: { type: "string" },
        niche: { type: "string" },
        target_audience: { type: "string" },
        tone: { type: "string" },
        main_goal: { type: "string" },
        product_service: { type: "string" },
        experience_level: { type: "string" },
        preferred_formats: { type: "string" },
        content_pillars: { type: "string" },
        content_style: { type: "string" },
        preferences: { type: "string" },
        recent_context: { type: "string" },
      },
    },
  },
};

async function chatCompletion(messages, tools) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(tools ? { tools, tool_choice: "auto" } : {}),
    }),
  });
  return res.json();
}

// history: آرایه‌ای از { role: "user"|"assistant", content } از حافظه ذخیره‌شده
async function runAgent(userMessage, history) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  let data = await chatCompletion(messages, [SAVE_PROFILE_TOOL]);
  if (data.error) {
    console.error("OpenAI error:", data.error);
    return { text: "الان یه مشکل موقت پیش اومد، دوباره امتحان کن.", savedProfile: null };
  }

  let assistantMessage = data.choices[0].message;
  let savedProfile = null;

  // اگه مدل تصمیم گرفت save_profile رو صدا بزنه (یک دور tool-calling، مثل ورک‌فلوی اصلی)
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    messages.push(assistantMessage);
    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.function.name === "save_profile") {
        try {
          savedProfile = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          savedProfile = {};
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "پروفایل ذخیره شد.",
        });
      }
    }
    data = await chatCompletion(messages);
    assistantMessage = data.choices[0].message;
  }

  return { text: assistantMessage.content, savedProfile };
}

module.exports = { runAgent };
