// index.js — Railway WhatsApp Bot (QR LOGS MODE)

require("dotenv").config();
const { create } = require("@open-wa/wa-automate");
const express = require("express");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health-check
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// WhatsApp başlat
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true,
  useChrome: false,
  killProcessOnBrowserClose: false,

  // EN ÖNEMLİ AYAR → QR LOGS
  qrLogSkip: false,   // QR ASCII olarak Railway Logs’a BASILSIN
  qrRefreshS: 10,     // QR her 10 sn'de yenilensin
  qrTimeout: 0,

  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,
  sessionDataPath: "./session",

  chromiumArgs: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-software-rasterizer",
    "--disable-features=VizDisplayCompositor",
    "--window-size=1920,1080",
  ],
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı!");
    startBot(client);
  })
  .catch((e) => console.error("❌ Bot başlatılamadı:", e));

// Dil tespiti
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  return trChars.test(text) ? "tr" : "de";
}

// OpenAI cevabı
async function generateAiReply(userText, lang) {
  const baseSystemPrompt = `
Sen, Avrupa'nın her yerine premium tekstil ürünleri tedarik eden kurumsal bir firmanın müşteri temsilcisisin.
Ton: profesyonel, samimi, çözüm odaklı.
Fiyat verme. Önce ihtiyaç, adet, ölçü sor.`;

  const system = lang === "tr"
    ? `${baseSystemPrompt}\nCevap dili: Türkçe.`
    : `${baseSystemPrompt}\nAntwortsprache: Deutsch.`;

  const input = [
    { role: "system", content: system },
    { role: "user", content: userText }
  ];

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input,
  });

  return response.output[0].content[0].text.trim();
}

// Mesaj dinleme
function startBot(client) {
  console.log("🤖 Mesajlar dinleniyor...");

  client.onMessage(async (msg) => {
    if (msg.fromMe || msg.isGroupMsg) return;
    const text = msg.body.trim();
    const lang = detectLanguage(text);

    try {
      const reply = await generateAiReply(text, lang);
      await client.sendText(msg.from, reply);
      console.log("➡️ Yanıt gönderildi.");
    } catch (e) {
      console.error("❌ Cevap hatası:", e);
    }
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server çalışıyor → PORT ${PORT}`);
});
