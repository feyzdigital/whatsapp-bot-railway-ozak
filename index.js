import express from "express";
import { create } from "@open-wa/wa-automate";

const app = express();
const PORT = process.env.PORT || 8080;

let qrPngBuffer = null;   // QR kod PNG hafızada tutulacak

app.get("/", (req, res) => {
  res.send("WhatsApp Textile Assistant bot is running 🚀");
});

// PNG olarak QR dönen endpoint
app.get("/qr.png", (req, res) => {
  if (!qrPngBuffer) {
    return res.send("QR henüz hazır değil. Lütfen birkaç saniye sonra yenileyin.");
  }

  res.setHeader("Content-Type", "image/png");
  res.send(qrPngBuffer);
});

// WhatsApp başlat
create({
  sessionId: "feyz-bot",
  multiDevice: true,
  qrTimeout: 0,
  authTimeout: 0,
  qrLogSkip: true, // konsola QR basmayı devre dışı bırak
}, 
// BU QR CALLBACK PNG ÜRETİR
(qrData, qrPng) => {
  if (qrPng) {
    qrPngBuffer = qrPng; // PNG hafızaya alınır
    console.log("✔️ Yeni QR PNG üretildi.");
  }
})
.then(client => startBot(client));

function startBot(client) {
  console.log("WhatsApp bot connected!");

  client.onMessage(async msg => {
    if (msg.body === "merhaba") {
      await client.sendText(msg.from, "Merhaba! 👋 Nasıl yardımcı olabilirim?");
    }
  });
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
