// index.js
// WhatsApp Bot + OpenAI TR/DE Kurumsal Tekstil Asistanı

require("dotenv").config();
const express = require("express");
const { create } = require("@open-wa/wa-automate");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- HEALTH CHECK (Railway) ---
app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// --- WHATSAPP CLIENT BAŞLATMA ---
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

  // QR görüntüleme ayarları
  qrLogSkip: false,        // QR konsolda görünsün
  qrRefreshS: 0,
  qrTimeout: 0,
  qrOutput: "terminal",    // ASCII QR
  qrScreenshot: false,

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

// --- DİL TESPİTİ ---
function detectLanguage(text) {
  const trChars = /[çğıöşüÇĞİÖŞÜ]/;
  return trChars.test(text) ? "tr" : "de";
}

// --- OPENAI YANIT ÜRETİCİ ---
async function generateAiReply(userText, lang) {
  const basePrompt = `
Sen, Avrupa'nın her yerine 1. sınıf premium tekstil ürünleri tedarik eden kurumsal bir firmanın
uluslararası müşteri temsilcisisin. Tonun:
- Profesyonel,
- Samimi,
- Çözüm odaklı,
- WhatsApp sohbetine uygun kısa cümleler.

Müşteriden şu bilgileri nazikçe iste:
• Hangi ürünle ilgileniyor? (otel tekstili, havlu, nevresim, masa örtüsü vb.)
• Ölçü / adet / metraj
• Teslim adresi (ülke-şehir)
• Hedef fiyat aralığı varsa belirtmesini rica et.

Fiyat verme. Sadece bilgi topla ve yardımcı ol.
`;

  const systemPromptTr = `${basePrompt}
Cevap dili: Türkçe.
Hitap şekli: Siz.
İlk mesajda kendini tanıt: "Ben firmanın uluslararası satış ekibindenim."
`;

  const systemPromptDe = `${basePrompt}
Antwortsprache: Deutsch.
Höflich, professionell, aber natürlich und locker.
`;

  const systemPrompt = lang === "tr" ? systemPromptTr : systemPromptDe;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userText },
  ];

  const response = await openai.responses.create({
    model: "gpt-5.1-mini",
    input: messages,
  });

  return response.output[0]?.content?.[0]?.text?.trim() || "";
}

// --- MESAJ DİNLİYOR ---
function startBot(client) {
  console.log("🤖 startBot çalıştı — mesajlar dinleniyor...");

  client.onMessage(async (message) => {
    if (message.fromMe) return;          // kendi mesajımızı geç
    if (message.isGroupMsg) return;      // grup mesajı yok

    const text = (message.body || "").trim();
    if (!text) return;

    console.log("📩 Yeni mesaj:", {
      from: message.from,
      name: message.sender?.pushname,
      text,
    });

    const lang = detectLanguage(text);

    try {
      const reply = await generateAiReply(text, lang);
      await client.sendText(message.from, reply);

      console.log("✅ Yanıt gönderildi.");
    } catch (err) {
      console.error("❌ AI hata:", err);

      const fallback =
        lang === "tr"
          ? "Şu anda geçici bir teknik sorun yaşıyoruz. Mesajınızı aldım, size en kısa sürede dönüş sağlayacağım. 🙏"
          : "Momentan gibt es ein technisches Problem. Ich habe Ihre Nachricht erhalten und melde mich schnellstmöglich. 🙏";

      await client.sendText(message.from, fallback);
    }
  });
}

// --- HTTP SERVER ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server çalışıyor: http://localhost:${PORT}`);
});
