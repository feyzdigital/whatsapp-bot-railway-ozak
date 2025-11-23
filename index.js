// index.js
// WhatsApp Bot + OpenAI TR/DE Kurumsal Tekstil Asistanı

require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health check
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// **QR görüntüsünü indirme endpoint'i**
app.get("/qr", (req, res) => {
  const qrPath = path.join(__dirname, "session", "last_qr.png");
  if (!fs.existsSync(qrPath)) {
    return res.status(404).send("QR hazır değil.");
  }
  res.sendFile(qrPath);
});

// WhatsApp Bot başlat
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

  qrLogSkip: true,       // ❗ ASCII QR basmayı kapatıyoruz
  qrRefreshS: 15,
  qrTimeout: 0,
  qrOutput: "png",
  qrScreenshot: true,    // PNG çıktı
  chromiumArgs: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-features=VizDisplayCompositor",
    "--window-size=1920,1080",
  ],
})
  .then((client) => {
    console.log("✅ WhatsApp bot başlatıldı!");
    startBot(client);
  })
  .catch((err) => console.error("❌ Bot başlatılamadı:", err));

/* Dil algılama */
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  return trChars.test(text) ? "tr" : "de";
}

/* OpenAI cevap üretimi */
async function generateAiReply(userText, lang) {
  const systemBase = `
Sen Avrupa’ya premium tekstil üreten bir firmanın müşteri temsilcisisin.
Profesyonel ama samimi bir ton kullan.
Fiyat verme. 
Müşteriden ürün tipi, adet, metraj, teslim adresi gibi bilgileri iste.
WhatsApp uygun kısa mesajlar yaz.
`;

  const systemPrompt =
    lang === "tr"
      ? systemBase + "\nCevap dili Türkçe olsun."
      : systemBase + "\nAntwortsprache Deutsch.";

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
  });

  return response.output[0]?.content?.[0]?.text?.trim() || "";
}

/* Mesaj dinleyici */
function startBot(client) {
  console.log("🤖 Mesaj dinleyici aktif");

  client.onMessage(async (message) => {
    if (message.fromMe || message.isGroupMsg) return;

    const text = message.body?.trim();
    if (!text) return;

    console.log("📩 Mesaj:", text);

    const lang = detectLanguage(text);

    try {
      const reply = await generateAiReply(text, lang);
      await client.sendText(message.from, reply);
    } catch (err) {
      console.error("❌ Cevap üretilemedi:", err);

      await client.sendText(
        message.from,
        lang === "tr"
          ? "Anlık bir teknik sorun oluştu. Mesajınızı aldık, dönüş yapacağız. 🙏"
          : "Ein technisches Problem ist aufgetreten. Wir melden uns bald. 🙏"
      );
    }
  });
}

// Express server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Sunucu çalışıyor: http://localhost:${PORT}`);
});
