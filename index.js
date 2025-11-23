// index.js — WhatsApp Bot + OpenAI + Railway compatible clean QR PNG

require("dotenv").config();
const express = require("express");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------
// QR CACHE DEĞİŞKENLERİ
// -----------------------
let lastQrPng = null;         // data:image/png;base64,... şeklinde
let lastQrTimestamp = 0;      // QR ne zaman üretildi

// -----------------------
// OpenAI Client
// -----------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -----------------------
// Health Check
// -----------------------
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// -----------------------
// QR PNG Endpoint
// -----------------------
app.get("/qr.png", (req, res) => {
  if (!lastQrPng) {
    return res
      .status(503)
      .send("QR henüz hazır değil. Lütfen birkaç saniye sonra sayfayı yenileyin.");
  }

  // QR çok eski ise (5 dk)
  const ageMs = Date.now() - lastQrTimestamp;
  if (ageMs > 1000 * 60 * 5) {
    return res
      .status(410)
      .send("QR süresi doldu. Lütfen sayfayı yenileyip yeni QR bekleyin.");
  }

  const base64 = lastQrPng.split(",")[1];
  const pngBuffer = Buffer.from(base64, "base64");

  res.setHeader("Content-Type", "image/png");
  res.send(pngBuffer);
});

// -----------------------
// WhatsApp Bot Başlatma
// -----------------------
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true,
  useChrome: false,
  authTimeout: 0,
  restartOnCrash: true,
  cacheEnabled: false,
  killProcessOnBrowserClose: false,
  sessionDataPath: "./session",

  qrLogSkip: true, // ASCII QR gizle
  qrRefreshS: 0,
  qrTimeout: 0,
  qrOutput: "png",
  qrScreenshot: true,

  // 🔥 QR CALLBACK — WhatsApp'ın orijinal PNG’sini yakalıyoruz.
  qrCallback: (qrData, asciiQR, attempts) => {
    console.log("📲 Yeni QR alındı! /qr.png üzerinden tarayabilirsiniz.");
    lastQrPng = qrData;
    lastQrTimestamp = Date.now();
  },

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
  .catch((err) => {
    console.error("❌ Bot başlatma hatası:", err);
  });

// -----------------------
// Dil Tespiti
// -----------------------
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  return trChars.test(text) ? "tr" : "de";
}

// -----------------------
// OpenAI Mesaj Üretimi
// -----------------------
async function generateAiReply(userText, lang) {
  const basePrompt = `
Sen, Avrupa'nın her yerine premium tekstil ürünleri sağlayan bir firmanın 
profesyonel müşteri temsilcisisin.
Tonun:
- Kurumsal
- Samimi
- Çözüm odaklı
- WhatsApp formatına uygun kısa net cevaplar.

Asla fiyat verme.
Her zaman önce bilgi topla:
- Ürün türü
- Adet / metraj
- Teslim adresi
- Teknik detaylar
Son cümlede: "İsterseniz numune veya görsel paylaşabilirim." ekle.
`;

  const systemPromptTr = `${basePrompt}
Cevap dili: Türkçe.
Kendini kısaca tanıt.
`;

  const systemPromptDe = `${basePrompt}
Antwortsprache: Deutsch.
Kurz, professionell, freundlich.
`;

  const systemPrompt = lang === "tr" ? systemPromptTr : systemPromptDe;

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
  });

  return response.output[0]?.content?.[0]?.text || "";
}

// -----------------------
// Mesaj Yönetimi
// -----------------------
function startBot(client) {
  client.onMessage(async (message) => {
    if (message.fromMe) return;
    if (message.isGroupMsg) return;

    const text = (message.body || "").trim();
    if (!text) return;

    console.log("📩 Yeni mesaj:", text);

    const lang = detectLanguage(text);

    try {
      const reply = await generateAiReply(text, lang);
      await client.sendText(message.from, reply);
    } catch (err) {
      console.error("❌ Mesaj yanıtlama hatası:", err);
      const fallback =
        lang === "tr"
          ? "Teknik bir sorun oluştu. Mesajınızı aldım, ekibe iletiyorum. 🙏"
          : "Es gibt gerade ein technisches Problem. Ich melde mich bald. 🙏";
      await client.sendText(message.from, fallback);
    }
  });
}

// -----------------------
// HTTP Server
// -----------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server aktif: http://localhost:${PORT}`);
});
