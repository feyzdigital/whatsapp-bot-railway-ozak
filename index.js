// index.js
// Ozak Textile & Pack – WhatsApp Satış Asistanı (TR/DE/EN)
// QR streaming + doğal satışçı mantığı

const { create, ev } = require('@open-wa/wa-automate');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

// ------------------------------------
// QR STATE
// ------------------------------------
let latestQrDataUrl = null;
let lastQrTime = 0;
let isAuthenticated = false;

// ------------------------------------
// ÜRÜN ENVANTERİ (ÖZET)
// Sadece elimizde gerçekten olan gruplar
// ------------------------------------

// TEXTILE – ana odağımız
const TEXTILE_PRODUCTS = [
  {
    key: 'sweatshirt',
    tr: 'Sweatshirt',
    de: 'Sweatshirt',
    en: 'Sweatshirt',
    tags: ['sweatshirt', 'swet', 'üst giyim', 'kışlık', 'crew', 'kapşonsuz'],
  },
  {
    key: 'hoodie',
    tr: 'Hoodie (kapüşonlu sweatshirt)',
    de: 'Hoodie (Kapuzensweatshirt)',
    en: 'Hoodie (hooded sweatshirt)',
    tags: ['hoodie', 'kapüşon', 'kapşon', 'kapşonlu'],
  },
  {
    key: 'polar',
    tr: 'Polar Ceket',
    de: 'Fleece-Jacke',
    en: 'Fleece Jacket',
    tags: ['polar', 'polar ceket', 'fleece'],
  },
  {
    key: 'polo',
    tr: 'Polo Yaka T-shirt',
    de: 'Polo-Shirt',
    en: 'Polo T-shirt',
    tags: ['polo', 'polo yaka', 'yaka'],
  },
  {
    key: 'tshirt',
    tr: 'Bisiklet Yaka Likralı T-shirt',
    de: 'Rundhals T-Shirt',
    en: 'Crew Neck T-shirt',
    tags: ['tshirt', 'tişört', 't-shirt', 't shirt', 't shırt'],
  },
];

// PACKAGING – destek ürünler
const PACKAGING_PRODUCTS = [
  {
    key: 'durum',
    tr: 'Dürüm Kağıdı',
    de: 'Dürüm-Papier',
    en: 'Wrap Paper',
    tags: ['dürüm', 'wrap', 'dürüm kağıdı'],
  },
  {
    key: 'doner',
    tr: 'Döner Kağıdı',
    de: 'Döner-Papier',
    en: 'Doner Paper',
    tags: ['döner', 'döner kağıdı'],
  },
  {
    key: 'printed_napkin',
    tr: 'Baskılı Peçete',
    de: 'Bedruckte Serviette',
    en: 'Printed Napkin',
    tags: ['peçete', 'baskılı peçete', 'servis peçete'],
  },
  {
    key: 'cutlery_napkin',
    tr: 'Çatal-Bıçaklı Cepli Peçete',
    de: 'Besteckserviette mit Tasche',
    en: 'Cutlery Pouch Napkin',
    tags: ['cepli peçete', 'çatal', 'bıçak', 'cutlery'],
  },
  {
    key: 'pizza_box',
    tr: 'Pizza Kutusu',
    de: 'Pizzakarton',
    en: 'Pizza Box',
    tags: ['pizza', 'pizza kutusu', 'kutu'],
  },
];

// ------------------------------------
// DİL ALGILAMA
// ------------------------------------

function detectLanguage(textRaw) {
  const text = (textRaw || '').toLowerCase();

  const hasTR =
    /[ığüşöçİĞÜŞÖÇ]/.test(textRaw || '') ||
    /(merhaba|teşekkür|teşekkur|fiyat|adet|firma|işletme|özel üretim|teklif)/i.test(
      text
    );

  const hasDE =
    /[äöüßÄÖÜ]/.test(textRaw || '') ||
    /(hallo|guten tag|danke|anfrage|stück|firma|betrieb|angebot|preis)/i.test(
      text
    );

  const hasEN =
    /(hello|hi|good morning|good afternoon|thanks|thank you|price|quote|company)/i.test(
      text
    );

  if (hasTR && !hasDE && !hasEN) return 'tr';
  if (hasDE && !hasTR && !hasEN) return 'de';
  if (hasEN && !hasTR && !hasDE) return 'en';

  // Öncelik sırası: TR > DE > EN
  if (hasTR) return 'tr';
  if (hasDE) return 'de';
  if (hasEN) return 'en';

  // Default: TR
  return 'tr';
}

// ------------------------------------
// MESAJ ANALİZİ (SEKTÖR, ÜRÜN, ADET, FİYAT)
// ------------------------------------

function extractBasics(textRaw) {
  const text = (textRaw || '').toLowerCase();

  const isGreeting =
    /(merhaba|selam|iyi günler|iyi akşamlar|günaydın|moin|hallo|hello|hi\b)/i.test(
      text
    );

  const wantsPrice =
    /(fiyat|ücret|kaça|ne kadar|angebot|preis|kosten|price|quote|offer)/i.test(
      text
    );

  const hasQty =
    /\b\d+\s*(adet|pcs|stück|tane)?\b/i.test(text) ||
    /(adet|tane|stück|pieces?)/i.test(text);

  const isOffTopic =
    /(motivasyon|aşk|ilişki|hava nasıl|hava durumu|oyun|film|dizi)/i.test(text);

  const mentionsTextileKeywords =
    /(sweatshirt|hoodie|polar|polo|t[- ]?shirt|tişört|tshirt|üniforma|forma|personel|çalışan|iş kıyafeti|arbeitskleidung|uniform)/i.test(
      text
    );

  const mentionsPackagingKeywords =
    /(dürüm|döner|peçete|servis peçete|cepli peçete|pizza|karton|kutu|ambalaj|tek kullanımlık|take away|takeaway|delivery)/i.test(
      text
    );

  const sectorHints = [];
  if (/otel|hotel/i.test(text)) sectorHints.push('hotel');
  if (/restoran|restaurant|lokanta/i.test(text)) sectorHints.push('restaurant');
  if (/kafe|cafe|kahve/i.test(text)) sectorHints.push('cafe');
  if (/catering|organizasyon/i.test(text)) sectorHints.push('catering');
  if (/inşaat|insaat|şantiye|santiye|bau|construction/i.test(text))
    sectorHints.push('construction');
  if (/klinik|hastane|health|arztpraxis/i.test(text)) sectorHints.push('clinic');

  const productHits = {
    textile: [],
    packaging: [],
  };

  const lowered = text;

  TEXTILE_PRODUCTS.forEach((p) => {
    if (p.tags.some((tag) => lowered.includes(tag))) {
      productHits.textile.push(p);
    }
  });

  PACKAGING_PRODUCTS.forEach((p) => {
    if (p.tags.some((tag) => lowered.includes(tag))) {
      productHits.packaging.push(p);
    }
  });

  return {
    isGreeting,
    wantsPrice,
    hasQty,
    isOffTopic,
    mentionsTextileKeywords,
    mentionsPackagingKeywords,
    sectors: sectorHints,
    productHits,
  };
}

// ------------------------------------
// YARDIMCI: ÜRÜN ÖNERİ METNİ
// ------------------------------------

function buildProductSummary(lang, focus) {
  const useTextile = focus === 'textile' || focus === 'mixed';
  const usePackaging = focus === 'packaging' || focus === 'mixed';

  const parts = [];

  if (lang === 'tr') {
    if (useTextile) {
      parts.push(
        'Tekstil tarafında özellikle kurumsal üst giyim üretiyoruz: sweatshirt, hoodie, polar ceket, polo yaka ve bisiklet yaka t-shirt.'
      );
    }
    if (usePackaging) {
      parts.push(
        'Ambalaj tarafında ise baskılı dürüm ve döner kağıdı, baskılı peçete, çatal-bıçaklı cepli peçete ve pizza kutusu gibi tek kullanımlık ürünlerimiz var.'
      );
    }
  } else if (lang === 'de') {
    if (useTextile) {
      parts.push(
        'Im Textilbereich produzieren wir vor allem Corporate Oberbekleidung: Sweatshirts, Hoodies, Fleece-Jacken, Polo- und Rundhals-T-Shirts.'
      );
    }
    if (usePackaging) {
      parts.push(
        'Im Verpackungsbereich haben wir bedrucktes Dürüm- und Döner-Papier, bedruckte Servietten, Bestecktaschen-Servietten und Pizzakartons.'
      );
    }
  } else {
    // en
    if (useTextile) {
      parts.push(
        'On the textile side, we mainly produce corporate tops: sweatshirts, hoodies, fleece jackets, polo and crew neck t-shirts.'
      );
    }
    if (usePackaging) {
      parts.push(
        'On the packaging side, we offer printed wrap and doner paper, printed napkins, cutlery pouch napkins and pizza boxes.'
      );
    }
  }

  return parts.join(' ');
}

// ------------------------------------
// ANA CEVAP MOTORU
// ------------------------------------

function buildSmartReply(messageBody, lang) {
  const text = (messageBody || '').trim();
  const info = extractBasics(text);

  const hasAnyTextileSignal =
    info.mentionsTextileKeywords || info.productHits.textile.length > 0;
  const hasAnyPackagingSignal =
    info.mentionsPackagingKeywords || info.productHits.packaging.length > 0;

  // FOCUS hesapla
  let focus = 'textile';
  if (hasAnyTextileSignal && hasAnyPackagingSignal) focus = 'mixed';
  else if (!hasAnyTextileSignal && hasAnyPackagingSignal) focus = 'packaging';

  // 1) Çok off-topic ise: nazikçe satışa çek
  if (info.isOffTopic) {
    if (lang === 'tr') {
      return (
        'Güzel bir soru 🙂 Ama ben burada daha çok işletmeniz için tekstil ve baskılı ambalaj çözümlerine odaklanıyorum.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nİsterseniz işletmenizi ve şu an için en öncelikli ürün ihtiyacınızı (örneğin personel üst giyim veya baskılı peçete/ambalaj) kısaca yazın; buradan birlikte şekillendirelim.'
      );
    } else if (lang === 'de') {
      return (
        'Spannende Frage 🙂 Ich bin hier aber hauptsächlich für Ihre Textil- und Verpackungslösungen zuständig.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nWenn Sie möchten, schreiben Sie kurz, welche Art von Betrieb Sie haben und womit wir starten sollen (z.B. Mitarbeiterbekleidung oder bedruckte Servietten/Verpackung).'
      );
    } else {
      return (
        "Nice question 🙂 but here I'm mainly focused on textile and printed packaging solutions for your business.\n\n" +
        buildProductSummary(lang, 'mixed') +
        "\n\nIf you tell me what type of business you run and which product group is most urgent right now (for example staff wear or printed napkins/packaging), we can continue from there."
      );
    }
  }

  // 2) Selam + çok genel mesaj (ilk temas gibi)
  if (info.isGreeting && !hasAnyTextileSignal && !hasAnyPackagingSignal) {
    if (lang === 'tr') {
      return (
        'Merhaba, Ozak Textile & Pack’e hoş geldiniz. 👋\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nİsterseniz kısaca işletmenizi (örneğin otel, restoran, kafe, üretim, inşaat vb.) ve öncelikli ihtiyacınızı yazın; ben de size en uygun ürün grubunu önereyim.'
      );
    } else if (lang === 'de') {
      return (
        'Hallo, willkommen bei Ozak Textile & Pack. 👋\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nSchreiben Sie mir kurz, was für einen Betrieb Sie haben (z.B. Hotel, Restaurant, Café, Produktion, Bau etc.) und welches Thema gerade am wichtigsten ist. Dann schlage ich Ihnen passende Produkte vor.'
      );
    } else {
      return (
        'Hello, welcome to Ozak Textile & Pack. 👋\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nIf you briefly describe your business (hotel, restaurant, café, production, construction etc.) and what you need first, I can guide you to the most suitable product group.'
      );
    }
  }

  // 3) TEXTILE ağırlıklı net bir istek (örnek: inşaat firması için mont/yelek/tshirt)
  if (hasAnyTextileSignal) {
    const hasConstruction = info.sectors.includes('construction');

    if (lang === 'tr') {
      let intro = '';

      if (hasConstruction) {
        intro =
          'İnşaat tarafında çalışanlar için dayanıklı ve kolay temizlenebilir üst giyim gerçekten önemli, çok doğru bir ihtiyaç tanımı yapmışsınız.\n\n';
      }

      const qtyNote = info.hasQty
        ? 'Adet bilgisi vermeniz çok iyi oldu, üretim tarafında planlama yaparken direkt net çalışabiliyoruz.\n'
        : 'Yaklaşık adet bilgisini de paylaşırsanız, üretim tarafında sizi en verimli çözümle yönlendirebiliriz.\n';

      const priceNote =
        info.wantsPrice
          ? 'Fiyatlandırmayı burada otomatik paylaşmak yerine, talebiniz netleştikten sonra size özel teklif olarak hazırlanıyor. Bu sayede gereksiz kalem olmadan, direkt ihtiyacınıza göre bir çalışma çıkıyor.\n\n'
          : '';

      const productText =
        'Üst giyim tarafında sweatshirt, hoodie, polar ceket, polo ve bisiklet yaka t-shirt ile çalışıyoruz. Tamamı logo nakış/baskı uygulamasına uygun, kurumsal kalite kumaşlarla üretiliyor.';

      return (
        intro +
        qtyNote +
        priceNote +
        productText +
        '\n\nDilerseniz şu sorularla netleştirelim:\n' +
        '• Personeliniz için hangi kombin daha uygun olur: sweatshirt/hoodie mi, yoksa daha çok polo & t-shirt odaklı mı düşünüyorsunuz?\n' +
        '• Kurumsal renklerinizi (ve varsa logo dosyanızı) kısaca paylaşabilir misiniz?'
      );
    } else if (lang === 'de') {
      const qtyNote = info.hasQty
        ? 'Dass Sie die Stückzahl nennen, ist perfekt – so können wir die Produktion direkt passend planen.\n'
        : 'Wenn Sie mir eine ungefähre Stückzahl nennen, kann ich die Lösung produktionstechnisch besser einschätzen.\n';

      const priceNote =
        info.wantsPrice
          ? 'Preise verschicken wir nicht automatisch im Chat, sondern immer als individuelles Angebot, sobald Ihre Anfrage klar ist. So bleibt es für Sie übersichtlich und wirklich bedarfsgerecht.\n\n'
          : '';

      const productText =
        'Im Bereich Oberbekleidung arbeiten wir mit Sweatshirts, Hoodies, Fleece-Jacken sowie Polo- und Rundhals-T-Shirts – alle geeignet für Logo-Stick oder -Druck in Corporate-Qualität.';

      return (
        qtyNote +
        priceNote +
        productText +
        '\n\nLassen Sie uns kurz klären:\n' +
        '• Was passt besser zu Ihrem Team: eher Sweatshirt/Hoodie oder eher Polo & T-Shirt?\n' +
        '• In welchen Farben bzw. mit welchem Logo möchten Sie arbeiten?'
      );
    } else {
      const qtyNote = info.hasQty
        ? 'Great that you already mentioned approximate quantities – that really helps on the production side.\n'
        : 'If you can share an approximate quantity, we can better shape the production and pricing on our side.\n';

      const priceNote =
        info.wantsPrice
          ? 'Instead of sending automatic price lists here, we prepare a tailored quotation once your request is clear. That way you only see what is really relevant for your business.\n\n'
          : '';

      const productText =
        'For staffwear tops we mainly work with sweatshirts, hoodies, fleece jackets, polo and crew neck t-shirts – all suitable for logo embroidery or print, in corporate-quality fabrics.';

      return (
        qtyNote +
        priceNote +
        productText +
        '\n\nTo move forward, it would help to know:\n' +
        '• Which combination fits your team better: sweatshirt/hoodie or more polo & t-shirts?\n' +
        '• Which colors and logo should we work with?'
      );
    }
  }

  // 4) PACKAGING ağırlıklı (dürüm, döner, peçete, pizza vb.)
  if (hasAnyPackagingSignal) {
    if (lang === 'tr') {
      const qtyPart = info.hasQty
        ? 'Adet bilgisi verdiğinizde üretim planlamasını çok daha hızlı netleştirebiliyoruz.\n'
        : 'Bu ürün grubunda genelde yüksek adetlerle çalışıyoruz; yaklaşık bir yıllık tüketim ya da sipariş adeti paylaşmanız planlama için çok faydalı olur.\n';

      const pricePart = info.wantsPrice
        ? 'Fiyatları buradan otomatik yazmıyoruz; sektör, adet ve baskı detayına göre size özel teklif hazırlanıyor.\n\n'
        : '';

      return (
        'Baskılı ambalaj tarafı için çok doğru yerdesiniz. Özellikle dürüm/döner kağıdı, baskılı peçete, çatal-bıçaklı cepli peçete ve pizza kutusu üretiyoruz.\n\n' +
        qtyPart +
        pricePart +
        'Kısaca şunları yazarsanız, sizin için en mantıklı kombinasyonu önerebilirim:\n' +
        '• Ürün grubunuz: dürüm/döner, pizza, sıcak-soğuk içecek, vb.\n' +
        '• Tek kullanımlık tarafta öne çıkan ürün tipleri (kağıt, peçete, kutu vb.)\n' +
        '• Logo baskısı düşünüyor musunuz, sadece beyaz/renkli düz ürün mü istersiniz?'
      );
    } else if (lang === 'de') {
      const qtyPart = info.hasQty
        ? 'Mit einer konkreten Stückzahl können wir die Produktion deutlich besser einplanen.\n'
        : 'In diesem Bereich arbeiten wir meist mit großen Stückzahlen; ein grober Jahresverbrauch oder Bestellmenge wäre hilfreich.\n';

      const pricePart = info.wantsPrice
        ? 'Preise senden wir nicht automatisch, sondern immer als individuelles Angebot – abhängig von Motiv, Auflage und Produkt.\n\n'
        : '';

      return (
        'Für bedruckte Verpackungslösungen sind Sie hier genau richtig. Wir produzieren u.a. Dürüm-/Döner-Papier, bedruckte Servietten, Bestecktaschen-Servietten und Pizzakartons.\n\n' +
        qtyPart +
        pricePart +
        'Schreiben Sie mir kurz:\n' +
        '• Für welche Produktgruppe (Dürüm/Döner, Pizza etc.)?\n' +
        '• Welche Einwegprodukte sind für Sie wichtiger (Papier, Serviette, Karton)?\n' +
        '• Mit Logo-Druck oder eher neutral?'
      );
    } else {
      const qtyPart = info.hasQty
        ? 'Having a quantity helps us plan production more accurately.\n'
        : 'In this product group we usually work with larger volumes, so an approximate yearly consumption or order quantity would be very helpful.\n';

      const pricePart = info.wantsPrice
        ? 'We don’t send automatic price lists here – pricing is always prepared as a tailored quotation based on artwork, volume and product type.\n\n'
        : '';

      return (
        'You are in the right place for printed food-service packaging. We produce items like wrap/doner paper, printed napkins, cutlery pouch napkins and pizza boxes.\n\n' +
        qtyPart +
        pricePart +
        'To guide you properly, it would help to know:\n' +
        '• Which main product group you focus on (wrap/doner, pizza, etc.)\n' +
        '• Which disposable items matter more for you (paper, napkins, boxes)\n' +
        '• Whether you want full logo printing or simpler branding.'
      );
    }
  }

  // 5) Ne tekstil ne ambalaj net değil ama iş odaklı soru
  if (!hasAnyTextileSignal && !hasAnyPackagingSignal) {
    if (lang === 'tr') {
      return (
        'Mesajınız için teşekkürler. Yazdıklarınız oldukça net, birkaç detayı birlikte şekillendirebiliriz.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nKısaca işletmenizin türünü (örneğin otel, restoran, kafe, üretim, inşaat vb.) ve önce tekstil mi yoksa tek kullanımlık/baskılı ambalaj tarafını mı ele almak istediğinizi paylaşırsanız, nokta atışı bir öneriyle devam edebilirim.'
      );
    } else if (lang === 'de') {
      return (
        'Vielen Dank für Ihre Nachricht. Was Sie schreiben, ist schon ziemlich klar – ein paar Details können wir gemeinsam konkretisieren.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nWenn Sie mir kurz sagen, was für einen Betrieb Sie haben und ob wir zuerst über Textil oder über Einweg-/Verpackungslösungen sprechen sollen, kann ich Ihnen einen sehr gezielten Vorschlag machen.'
      );
    } else {
      return (
        'Thank you for your message. What you wrote already gives a good idea; we just need to shape a few details together.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nIf you tell me what type of business you run and whether we should start with textile or with disposable/packaging items, I can share a very focused recommendation.'
      );
    }
  }

  // Safety fallback (teorik olarak buraya pek düşmez)
  if (lang === 'tr') {
    return (
      buildProductSummary(lang, 'mixed') +
      '\n\nİsterseniz işletme türünüzü ve öncelikli ürün ihtiyacınızı bir cümleyle yazın; oradan devam edelim.'
    );
  } else if (lang === 'de') {
    return (
      buildProductSummary(lang, 'mixed') +
      '\n\nSchreiben Sie mir kurz, was für einen Betrieb Sie haben und welches Produkt-Thema aktuell Priorität hat.'
    );
  } else {
    return (
      buildProductSummary(lang, 'mixed') +
      '\n\nIf you share your business type and which product group is a priority right now, we can continue from there.'
    );
  }
}

// ------------------------------------
// QR EVENT LISTENER
// ------------------------------------

ev.on('qr.**', (qr, sessionId) => {
  console.log('🔥 Yeni QR event geldi! Session:', sessionId);

  if (!qr || typeof qr !== 'string') {
    console.log('QR geçersiz.');
    return;
  }

  latestQrDataUrl = qr;
  lastQrTime = Date.now();
  isAuthenticated = false;

  console.log('QR güncellendi. Uzunluk:', qr.length);
});

// ------------------------------------
// WA CLIENT BAŞLATMA
// ------------------------------------

function start() {
  console.log('WA başlatılıyor...');

  create({
    sessionId: 'railway-bot',
    multiDevice: true,
    qrTimeout: 0,
    authTimeout: 0,
    qrLogSkip: false,
    headless: true,
    useChrome: true, // Dockerfile içinde Chromium yüklü
    cacheEnabled: false,
    restartOnCrash: start,
  })
    .then((client) => {
      console.log('WA Client oluşturuldu 🚀');

      client.onStateChanged((state) => {
        console.log('State →', state);

        if (state === 'CONNECTED' || state === 'OPENING' || state === 'NORMAL') {
          isAuthenticated = true;
          latestQrDataUrl = null;
        } else {
          isAuthenticated = false;
        }
      });

      client.onLogout(() => {
        console.log('Çıkış yapıldı. QR yeniden beklenecek.');
        isAuthenticated = false;
        latestQrDataUrl = null;
      });

      // ------------------------------------
      // GELEN MESAJLARA CEVAP
      // ------------------------------------
      client.onMessage(async (msg) => {
        try {
          console.log('📩 Yeni mesaj:', {
            from: msg.from,
            isGroupMsg: msg.isGroupMsg,
            body: msg.body,
            fromMe: msg.fromMe,
          });

          // Kendi attığımız mesaja tekrar cevap verme
          if (msg.fromMe) {
            return;
          }

          // Grupları şimdilik es geç
          if (msg.isGroupMsg) {
            console.log('Grup mesajı algılandı, cevaplanmıyor.');
            return;
          }

          const lang = detectLanguage(msg.body || '');
          const replyText = buildSmartReply(msg.body, lang);

          // İnsan gibi hafif gecikmeli cevap
          const delayMs = 2000 + Math.floor(Math.random() * 4000); // 2–6 saniye
          console.log(`⏳ ${delayMs} ms sonra cevap gönderilecek →`, msg.from);

          setTimeout(async () => {
            try {
              await client.sendText(msg.from, replyText);
              console.log('✅ Mesaja cevap gönderildi:', msg.from);
            } catch (err) {
              console.error('Cevap gönderilirken hata:', err);
            }
          }, delayMs);
        } catch (err) {
          console.error('Mesaj işlenirken hata:', err);
        }
      });
    })
    .catch((err) => {
      console.error('WA hata:', err);
    });
}

// ------------------------------------
// EXPRESS ENDPOINTLER
// ------------------------------------

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    isAuthenticated,
    qrTimestamp: lastQrTime || null,
    qrAgeSeconds: lastQrTime
      ? Math.round((Date.now() - lastQrTime) / 1000)
      : null,
  });
});

app.get('/qr.png', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');

  if (isAuthenticated) {
    return res.status(200).send('ALREADY_AUTHENTICATED');
  }

  if (!latestQrDataUrl) {
    return res.status(503).send('QR_NOT_READY');
  }

  const base64 = latestQrDataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  res.setHeader('Content-Type', 'image/png');
  res.send(buffer);
});

// ------------------------------------
// SERVER + WA CLIENT BAŞLAT
// ------------------------------------

app.listen(PORT, () => {
  console.log('HTTP server çalışıyor:', PORT);
  start();
});
