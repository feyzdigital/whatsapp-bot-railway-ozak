// index.js
// WhatsApp Bot + OpenAI TR/DE Kurumsal Tekstil Asistanı

require("dotenv").config();
const express = require("express");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------------------------
// OPENAI CLIENT
// ----------------------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ----------------------------------------------------------------------
// HEALTH CHECK
// ----------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// ----------------------------------------------------------------------
// WHATSAPP BOT BAŞLAT
// ----------------------------------------------------------------------
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true, // Railway'de zorunlu
  useChrome: false,
  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,
  killProcessOnBrowserClose: false,
  sessionDataPath: "./session",
  qrLogSkip: true,
  qrRefreshS: 0,
  qrTimeout: 0,
  qrOutput: "png",
  qrScreenshot: true,

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
    console.log("✅ WhatsApp bot başlatıldı, client hazır!");
    startBot(client);
  })
  .catch((err) => {
    console.error("❌ Bot başlatılamadı:", err);
  });

// ----------------------------------------------------------------------
// DİL TESPİTİ
// ----------------------------------------------------------------------
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  if (trChars.test(text)) return "tr";
  return "de";
}

// ----------------------------------------------------------------------
// OPENAI MESAJ ÜRETİCİ
// ----------------------------------------------------------------------
async function generateAiReply(userText, lang) {
  const baseSystemPrompt = `
You are a **bilingual (Turkish + German)** international sales representative
for a company that produces ONLY **1st-class premium textile products**.

Your duties:
- Provide warm, professional and concise WhatsApp replies.
- Detect customer needs clearly and ask short follow-up questions.
- NEVER provide prices directly.
- ALWAYS stay in corporate tone but friendly and natural.
- NEVER give incorrect product details or promises.

Company facts (must always be consistent):
- The company manufactures ONLY 1st class textile products.
- NO second-quality or defective goods are produced.
- Supplies hotels, restaurants and premium clients across Europe.
- Strong in consistency, reliability and logistics.

Ask for:
- Product type (hotel textile, tablecloth, towel, bedsheet, etc.)
- Quantities / sizes / material preferences
- Delivery country & deadline
- Sample or photos if needed

Always avoid sounding like an AI.
Write like a real professional human sales agent.
  `;

  const systemPromptTr = `
${baseSystemPrompt}

Cevap dili: **Türkçe**.
Her zaman “siz” diye hitap et.
WhatsApp için doğal, kısa ve samimi ama kurumsal yaz.
Kendini tanıt: "Ben firmanın uluslararası satış ekibindenim."
  `;

  const systemPromptDe = `
${baseSystemPrompt}

Antwortsprache: **Deutsch**.
Höflich, professionell aber warm.
Kurze, natürliche WhatsApp-Nachrichten.
  `;

  const systemPrompt = lang === "tr" ? systemPromptTr : systemPromptDe;

  const input = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userText },
  ];

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input,
  });

  return response.output[0]?.content?.[0]?.text?.trim() || "";
}

// ----------------------------------------------------------------------
// MESAJ DİNLEYİCİ
// ----------------------------------------------------------------------
function startBot(client) {
  console.log("🤖 startBot aktif – mesajlar dinleniyor...");

  client.onMessage(async (message) => {
    if (message.fromMe) return;
    if (!message.body) return;
    if (message.isGroupMsg) return;

    const text = message.body.trim();
    console.log("📩 Yeni mesaj:", text);

    const lang = detectLanguage(text);

    try {
      const reply = await generateAiReply(text, lang);

      if (!reply) throw new Error("Boş cevap");

      await client.sendText(message.from, reply);
      console.log("✅ Yanıt gönderildi");
    } catch (err) {
      console.error("❌ Yanıt oluşturulamadı:", err);

      const fallback =
        lang === "tr"
          ? "Şu an teknik bir sorun var. Mesajınızı aldım ve ekibe ilettim. En kısa sürede dönüş yapacağız. 🙏"
          : "Momentan gibt es ein technisches Problem. Ich habe Ihre Nachricht erhalten. Wir melden uns so schnell wie möglich. 🙏";

      try {
        await client.sendText(message.from, fallback);
      } catch (e2) {
        console.error("❌ Fallback da gönderilemedi:", e2);
      }
    }
  });
}

// ----------------------------------------------------------------------
// HTTP SERVER
// ----------------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`);
});
