// lib/store.js — جایگزین "Content Bot Profiles" Data Table با Netlify Blobs
const { getStore, connectLambda } = require("@netlify/blobs");

// در حالت Lambda compatibility، Blobs باید دستی به event درخواست وصل بشه
// (باید یک‌بار در ابتدای هر اجرای فانکشن صدا زده بشه)
function initBlobs(event) {
  connectLambda(event);
}

function profileStore() {
  return getStore("content-bot-profiles");
}
function memoryStore() {
  return getStore("content-bot-memory");
}

async function getProfile(chatId) {
  const store = profileStore();
  const data = await store.get(`profile:${chatId}`, { type: "json" });
  return data || { chat_id: String(chatId) };
}

// merge کردن فیلدهای جدید روی پروفایل قبلی (دقیقاً مثل رفتار upsert در ورک‌فلوی اصلی)
async function saveProfile(chatId, fields) {
  const store = profileStore();
  const current = await getProfile(chatId);
  const merged = {
    ...current,
    ...fields,
    chat_id: String(chatId),
    profile_updated_at: new Date().toISOString(),
  };
  await store.setJSON(`profile:${chatId}`, merged);
  return merged;
}

async function resetProfile(chatId, userId) {
  const store = profileStore();
  const cleared = {
    chat_id: String(chatId),
    user_id: userId ? String(userId) : "",
    profile_updated_at: new Date().toISOString(),
  };
  await store.setJSON(`profile:${chatId}`, cleared);
  return cleared;
}

// حافظه مکالمه — معادل "User Memory" (contextWindowLength: 12) در ورک‌فلوی اصلی
async function getMemory(chatId) {
  const store = memoryStore();
  const data = await store.get(`memory:${chatId}`, { type: "json" });
  return data || [];
}

async function saveMemory(chatId, messages) {
  const store = memoryStore();
  const trimmed = messages.slice(-24); // ۱۲ رفت‌وبرگشت = ۲۴ پیام
  await store.setJSON(`memory:${chatId}`, trimmed);
}

module.exports = { initBlobs, getProfile, saveProfile, resetProfile, getMemory, saveMemory };
