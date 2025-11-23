// index.js — Railway için QR PNG destekli WhatsApp botu

require("dotenv").config();
const express = require("express");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Root test endpoint
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// Public QR endpoint
app.get("/qr.png", (req, res) => {
  const qrPath = "/tmp/qr.png";
  if (fs.existsSync(qrPath)) {
    res.sendFile(qrPath);
  } else {
    res.status(404).send("QR henüz oluşturulmadı.");
  }
});

// WHATSAPP BOT
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  headless: true,
  useChrome: false,
  restartOnCrash: true,
  authTimeout: 0,
  qrLogSkip: true,        // ASCII QR görselini gizler
  qrOutput: "png",        // PNG çıktısı alıyoruz
  qrRefreshS: 0,
  qrTimeout: 0,
  qrCallback: (qrData, asciiQR, attempts) => {
    const base64Data = qrData.replace(/^data:image\/png;base64,/, "");
    const qrPath = "/tmp/qr.png";

    fs.writeFileSync(qrPath, base64Data, "base64");
    console.log(`📌 Yeni QR kaydedildi: ${qrPath} (attempt: ${attempts})`);
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
    console.log("✅ WhatsApp bot başlatıldı, client hazır!");
    startBot(client);
  })
  .catch((err) => console.error("❌ Bot başlatılamadı:", err));

// Basit dil tespiti
function detectLanguage(text) {
  return /[çğıöşüÇĞİÖŞÜ]/.test(text) ? "tr" : "de";
}

// OpenAI reply
async function generateAiReply(userText, lang) {
  const systemTr = `
Profesyonel, samimi, çözüm odaklı bir tekstil müşteri temsilcisisin.
Cevap dili: Türkçe. Fiyat verme, sadece bilgi topla.`;

  const systemDe = `
Du bist ein professioneller, freundlicher Textil-Kundenberater.
Antwortsprache: Deutsch. Kein Preis — nur Bedarf klären.`;

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input: [
      { role: "system", content: lang === "tr" ? systemTr : systemDe },
      { role: "user", content: userText },
    ],
  });

  return response.output[0]?.content[0]?.text || "";
}

// Bot mesaj fonksiyonu
function startBot(client) {
  client.onMessage(async (msg) => {
    if (msg.fromMe || msg.isGroupMsg) return;

    const lang = detectLanguage(msg.body);
    const reply = await generateAiReply(msg.body, lang);

    await client.sendText(msg.from, reply);
  });
}

// HTTP server
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`)
);
