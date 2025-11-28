// index.js
// Ozak Textile & Pack – WhatsApp Satış Asistanı (TR/DE/EN)
// QR streaming + doğal satışçı + basit sohbet hafızası

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
// BASİT SOHBET HAFIZASI (RAM)
// chatId/from bazlı
// ------------------------------------
const chatSessions = {}; // { [chatId]: { lang, greetSent, businessType, lastFocus } }

function getSession(id) {
  if (!chatSessions[id]) {
    chatSessions[id] = {
      lang: null,
      greetSent: false,
      businessType: null, // 'hotel' | 'restaurant' | 'cafe' | 'construction' | ...
      lastFocus: null, // 'textile' | 'packaging' | 'mixed'
    };
  }
  return chatSessions[id];
}

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
    tags: ['polo', 'polo yaka', 'yaka', 'tshirt', 'tişört', 't-shirt', 't shirt'],
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
    /(merhaba|teşekkür|tesekkur|fiyat|adet|tane|firma|işletme|isletme|özel üretim|ozel uretim|teklif|istiyorum|lazım|lazim|var)/i.test(
      text
    );

  const hasDE =
    /[äöüßÄÖÜ]/.test(textRaw || '') ||
    /(hallo|guten tag|danke|anfrage|stück|stuck|betrieb|angebot|preis)/i.test(
      text
    );

  const hasEN =
    /(hello|hi\b|good morning|good afternoon|thanks|thank you|price|quote|company)/i.test(
      text
    );

  if (hasTR && !hasDE && !hasEN) return 'tr';
  if (hasDE && !hasTR && !hasEN) return 'de';
  if (hasEN && !hasTR && !hasDE) return 'en';

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
    /(merhaba|selam|slm\b|iyi günler|iyi akşamlar|günaydın|moin|hallo|hello|hi\b)/i.test(
      text
    );

  const wantsPrice =
    /(fiyat|ücret|ucret|kaça|kaca|ne kadar|angebot|preis|kosten|price|quote|offer)/i.test(
      text
    );

  const hasQty =
    /\b\d+\s*(adet|pcs|stück|stuck|tane)?\b/i.test(text) ||
    /(adet|tane|stück|stuck|pieces?)/i.test(text);

  const isOffTopic =
    /(motivasyon|aşk|ask|ilişki|iliski|hava nasıl|hava durumu|oyun|film|dizi)/i.test(
      text
    );

  // Textil sinyalleri – bilinçli geniş tuttuk
  const mentionsTextileKeywords =
    /(sweatshirt|hoodie|polar|polo|t[- ]?shirt|tişört|tisort|tshirt|üniforma|uniforma|forma|personel|çalışan|calisan|iş kıyafeti|is kiyafeti|arbeitskleidung|uniform|yelek|mont|ceket|hırka|hirka|gömlek|gomlek)/i.test(
      text
    );

  const mentionsPackagingKeywords =
    /(dürüm|durum|döner|doner|peçete|pecete|servis peçete|cepli peçete|pizza|karton|kutu|ambalaj|tek kullanımlık|tek kullanimlik|take away|takeaway|delivery)/i.test(
      text
    );

  const sectorHints = [];
  if (/otel|hotel/i.test(text)) sectorHints.push('hotel');
  if (/restoran|restaurant|lokanta/i.test(text)) sectorHints.push('restaurant');
  if (/kafe|cafe|kahve/i.test(text)) sectorHints.push('cafe');
  if (/catering|organizasyon|organisation/i.test(text)) sectorHints.push('catering');
  if (/inşaat|insaat|şantiye|santiye|bau|construction/i.test(text))
    sectorHints.push('construction');
  if (/klinik|hastane|health|arztpraxis|praxis/i.test(text))
    sectorHints.push('clinic');

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
// YARDIMCI: ÜRÜN ÖNERİ METNİ (KISA ÖZET)
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
// ANA CEVAP MOTORU (SESSION BİLGİSİYLE)
// ------------------------------------

function buildSmartReply(messageBody, lang, session) {
  const text = (messageBody || '').trim();
  const info = extractBasics(text);

  // Sektör bilgisini sessiyona yaz
  if (info.sectors.length > 0 && !session.businessType) {
    session.businessType = info.sectors[0];
  }

  const hasAnyTextileSignal =
    info.mentionsTextileKeywords || info.productHits.textile.length > 0;
  const hasAnyPackagingSignal =
    info.mentionsPackagingKeywords || info.productHits.packaging.length > 0;

  // FOCUS hesapla
  let focus = 'textile';
  if (hasAnyTextileSignal && hasAnyPackagingSignal) focus = 'mixed';
  else if (!hasAnyTextileSignal && hasAnyPackagingSignal) focus = 'packaging';
  session.lastFocus = focus;

  // --------------------------------
  // 1) Çok off-topic ise: nazikçe satışa çek
  // --------------------------------
  if (info.isOffTopic) {
    if (lang === 'tr') {
      return (
        'Güzel bir nokta 🙂 Ben burada daha çok işletmeniz için tekstil ve baskılı ambalaj çözümlerine odaklanıyorum.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nİsterseniz işletmenizi ve şu an için en öncelikli ürün ihtiyacınızı (örneğin personel üst giyim veya baskılı peçete/ambalaj) kısaca yazın; oradan devam edelim.'
      );
    } else if (lang === 'de') {
      return (
        'Spannende Frage 🙂 Ich bin hier allerdings hauptsächlich für Ihre Textil- und Verpackungslösungen zuständig.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nWenn Sie mir kurz Ihren Betrieb und das aktuell wichtigste Thema nennen (z.B. Mitarbeiterbekleidung oder bedruckte Servietten/Verpackung), können wir gezielt weitermachen.'
      );
    } else {
      return (
        "Nice question 🙂 but here I'm mainly focused on textile and printed packaging solutions for your business.\n\n" +
        buildProductSummary(lang, 'mixed') +
        "\n\nIf you tell me what type of business you run and which product group is most urgent right now (for example staff wear or printed napkins/packaging), we can continue from there."
      );
    }
  }

  // --------------------------------
  // 2) İLK SELAMLAMA (sadece 1 kere büyük intro)
  // --------------------------------
  if (info.isGreeting && !session.greetSent) {
    session.greetSent = true;

    if (lang === 'tr') {
      return (
        'Merhaba, Ozak Textile & Pack’e hoş geldiniz. 👋\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nKısaca işletmenizi (örneğin otel, restoran, kafe, üretim, inşaat vb.) ve ilk olarak hangi ürünle ilgilendiğinizi yazarsanız, buradan beraber netleştiririz.'
      );
    } else if (lang === 'de') {
      return (
        'Hallo, willkommen bei Ozak Textile & Pack. 👋\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nSchreiben Sie mir kurz, was für einen Betrieb Sie haben und mit welcher Produktgruppe wir starten sollen, dann finden wir eine passende Lösung.'
      );
    } else {
      return (
        'Hello, welcome to Ozak Textile & Pack. 👋\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nIf you briefly describe your business and what you need first, I can guide you to the most suitable product group.'
      );
    }
  }

  // --------------------------------
  // 3) TEXTILE ağırlıklı net bir istek (yelek/mont/tshirt vb.)
  // --------------------------------
  if (hasAnyTextileSignal) {
    const hasConstruction = session.businessType === 'construction';
    const hasRestaurant = session.businessType === 'restaurant';

    const mentionsVest =
      /yelek/.test(text) ||
      /mont/.test(text) ||
      /ceket/.test(text) ||
      /hirka|hırka/.test(text);

    if (lang === 'tr') {
      let intro = '';

      if (hasConstruction) {
        intro =
          'İnşaat tarafında çalışanlar için dayanıklı ve kolay temizlenebilir üst giyim gerçekten kritik; doğru yerdesiniz.\n\n';
      } else if (hasRestaurant) {
        intro =
          'Restoran ekibi için hem şık hem de dayanıklı, logolu üst giyim üretimi yapıyoruz; servis ve mutfak için farklı çözümler oluşturabiliyoruz.\n\n';
      }

      const qtyNote = info.hasQty
        ? 'Adet bilgisini paylaşmanız çok iyi oldu, üretim tarafında planlamayı direkt netleştirebiliyoruz.\n'
        : 'Yaklaşık adet bilgisini de paylaşırsanız, üretim tarafında sizi en verimli çözümle yönlendirebiliriz.\n';

      const priceNote = info.wantsPrice
        ? 'Fiyatı burada otomatik yazmıyoruz; talebiniz netleştikten sonra, size özel teklif olarak hazırlanıyor. Böylece gereksiz kalem olmadan sadece ihtiyacınıza uygun bir çalışma çıkıyor.\n\n'
        : '';

      let garmentHint = '';
      if (mentionsVest) {
        garmentHint =
          'Yelek, mont ve benzeri dış giyim ürünlerini de, aynı kurumsal kalite standartlarıyla logolu olarak üretebiliyoruz.\n';
      }

      const productText =
        'Üst giyim tarafında sweatshirt, hoodie, polar ceket, polo ve bisiklet yaka t-shirt ile çalışıyoruz. Tamamı logo nakış/baskı uygulamasına uygun, kurumsal kumaşlarla üretiliyor.';

      return (
        intro +
        garmentHint +
        qtyNote +
        priceNote +
        productText +
        '\n\nDevam edebilmem için kısaca şunları bilmem çok işe yarar:\n' +
        '• Ürünler daha çok hangi ekip için? (servis, mutfak, saha, depo vb.)\n' +
        '• Kurumsal renkleriniz ve logo kullanımınız nasıl? (örneğin sadece göğüs nakış, kol baskı vb.)'
      );
    } else if (lang === 'de') {
      const qtyNote = info.hasQty
        ? 'Dass Sie die Stückzahl nennen, ist perfekt – so können wir die Produktion direkt passend planen.\n'
        : 'Wenn Sie mir eine ungefähre Stückzahl nennen, kann ich die Lösung produktionstechnisch besser einschätzen.\n';

      const priceNote = info.wantsPrice
        ? 'Preise verschicken wir nicht automatisch im Chat, sondern als individuelles Angebot, sobald Ihre Anfrage klar ist.\n\n'
        : '';

      let garmentHint = '';
      if (mentionsVest) {
        garmentHint =
          'Auch Westen, Jacken oder ähnliche Outerwear können wir als Corporate-Bekleidung mit Ihrem Logo umsetzen.\n';
      }

      const productText =
        'Im Bereich Oberbekleidung arbeiten wir mit Sweatshirts, Hoodies, Fleece-Jacken sowie Polo- und Rundhals-T-Shirts – alle geeignet für Logo-Stick oder -Druck.';

      return (
        qtyNote +
        priceNote +
        garmentHint +
        productText +
        '\n\nHilfreich wäre noch kurz:\n' +
        '• Für welches Team sind die Teile gedacht? (Service, Küche, Außendienst etc.)\n' +
        '• In welchen Farben bzw. mit welchem Logo möchten Sie arbeiten?'
      );
    } else {
      const qtyNote = info.hasQty
        ? 'Great that you already mentioned quantities – that really helps on the production side.\n'
        : 'If you can share an approximate quantity, we can better plan production and shape a solution that makes sense for you.\n';

      const priceNote = info.wantsPrice
        ? 'Instead of sending automatic price lists, we prepare a tailored quotation once your request is clear.\n\n'
        : '';

      let garmentHint = '';
      if (mentionsVest) {
        garmentHint =
          'We can also produce vests, jackets and similar outerwear as corporate staffwear with your logo.\n';
      }

      const productText =
        'For staffwear tops we mainly work with sweatshirts, hoodies, fleece jackets, polo and crew neck t-shirts – all suitable for logo embroidery or print.';

      return (
        qtyNote +
        priceNote +
        garmentHint +
        productText +
        '\n\nTo move forward, it would help to know:\n' +
        '• Which team are these garments for? (service, kitchen, field, warehouse etc.)\n' +
        '• Which colors and logo placement do you prefer?'
      );
    }
  }

  // --------------------------------
  // 4) PACKAGING ağırlıklı (dürüm, döner, peçete, pizza vb.)
  // --------------------------------
  if (hasAnyPackagingSignal) {
    if (lang === 'tr') {
      const qtyPart = info.hasQty
        ? 'Adet bilgisi verdiğinizde üretim planlamasını çok daha hızlı netleştirebiliyoruz.\n'
        : 'Bu ürün grubunda genelde yüksek adetlerle çalışıyoruz; yaklaşık bir yıllık tüketim ya da sipariş adeti paylaşmanız planlama için çok faydalı olur.\n';

      const pricePart = info.wantsPrice
        ? 'Fiyatları buradan otomatik yazmıyoruz; sektör, adet ve baskı detayına göre size özel teklif hazırlanıyor.\n\n'
        : '';

      return (
        'Baskılı ambalaj tarafı için doğru yerdesiniz. Özellikle dürüm/döner kağıdı, baskılı peçete, çatal-bıçaklı cepli peçete ve pizza kutusu üretiyoruz.\n\n' +
        qtyPart +
        pricePart +
        'Kısaca şunları yazarsanız, sizin için en mantıklı kombinasyonu önerebilirim:\n' +
        '• Ürün grubunuz: dürüm/döner, pizza, içecek vb.\n' +
        '• Tek kullanımlık tarafta öne çıkan ürün tipleri (kağıt, peçete, kutu vb.)\n' +
        '• Logo baskısı düşünüyor musunuz, yoksa daha sade çözümler mi istersiniz?'
      );
    } else if (lang === 'de') {
      const qtyPart = info.hasQty
        ? 'Mit einer konkreten Stückzahl können wir die Produktion deutlich besser einplanen.\n'
        : 'In diesem Bereich arbeiten wir meist mit größeren Stückzahlen; ein grober Jahresverbrauch oder eine Bestellmenge wäre sehr hilfreich.\n';

      const pricePart = info.wantsPrice
        ? 'Preise senden wir nicht automatisch, sondern als individuelles Angebot – abhängig von Motiv, Auflage und Produkt.\n\n'
        : '';

      return (
        'Für bedruckte Verpackungslösungen sind Sie hier genau richtig. Wir produzieren u.a. Dürüm-/Döner-Papier, bedruckte Servietten, Bestecktaschen-Servietten und Pizzakartons.\n\n' +
        qtyPart +
        pricePart +
        'Schreiben Sie mir kurz:\n' +
        '• Für welche Produktgruppe (Dürüm/Döner, Pizza etc.)?\n' +
        '• Welche Einwegprodukte sind für Sie wichtiger (Papier, Servietten, Kartons)?\n' +
        '• Mit Logo-Druck oder eher schlicht?'
      );
    } else {
      const qtyPart = info.hasQty
        ? 'Having a quantity helps us plan production more accurately.\n'
        : 'In this product group we usually work with larger volumes, so an approximate yearly consumption or order quantity would be very helpful.\n';

      const pricePart = info.wantsPrice
        ? 'We don’t send automatic price lists – pricing is always prepared as a tailored quotation based on artwork, volume and product type.\n\n'
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

  // --------------------------------
  // 5) Ürün sinyali yok ama SEKTÖR bilgisi var
  // (örnek: "restoranımız var" mesajı)
// --------------------------------
  if (!hasAnyTextileSignal && !hasAnyPackagingSignal && session.businessType) {
    if (lang === 'tr') {
      let sectorText = '';
      if (session.businessType === 'restaurant') {
        sectorText =
          'Restoranlar için hem personel üst giyim hem de baskılı tek kullanımlık ürünler (peçete, kağıt vb.) üretebiliyoruz.\n\n';
      } else if (session.businessType === 'hotel') {
        sectorText =
          'Otel tarafında özellikle personel kıyafeti ve misafir temas noktalarında kullanılan baskılı ürünlerle çalışıyoruz.\n\n';
      } else if (session.businessType === 'cafe') {
        sectorText =
          'Kafeler için hem barista/servis ekibi için üst giyim, hem de baskılı peçete ve ambalaj çözümleri sunuyoruz.\n\n';
      } else if (session.businessType === 'construction') {
        sectorText =
          'İnşaat ve saha ekipleri için yüksek dayanımlı, logolu üst giyim üretiyoruz.\n\n';
      }

      return (
        sectorText +
        'Şu an ilk etapta hangi tarafa odaklanmak sizin için daha anlamlı olur?\n' +
        '• Personel üst giyim (sweatshirt, hoodie, t-shirt vb.)\n' +
        '• Tek kullanımlık/baskılı ürünler (peçete, kağıt, kutu vb.)\n\n' +
        'Hangi başlıktan başlayalım yazarsanız, detaylara oradan girelim.'
      );
    } else if (lang === 'de') {
      return (
        'Für Ihren Betrieb können wir sowohl Textil (Mitarbeiteroberbekleidung) als auch bedruckte Einwegprodukte anbieten.\n\n' +
        'Was ist für Sie im ersten Schritt wichtiger?\n' +
        '• Mitarbeiterbekleidung (Sweatshirt, Hoodie, T-Shirt etc.)\n' +
        '• Einweg-/Verpackungsprodukte (Servietten, Papier, Kartons etc.)'
      );
    } else {
      return (
        'For your type of business we can support both textile staffwear and printed disposable items.\n\n' +
        'Which side would you like to focus on first?\n' +
        '• Staffwear (sweatshirts, hoodies, t-shirts etc.)\n' +
        '• Disposable/packaging (napkins, paper, boxes etc.)'
      );
    }
  }

  // --------------------------------
  // 6) Ne sektör net ne de ürün sinyali güçlü
  // (kısa, tekrar etmeyen genel cevap)
// --------------------------------
  if (!hasAnyTextileSignal && !hasAnyPackagingSignal) {
    if (lang === 'tr') {
      return (
        'Mesajınız için teşekkürler, birkaç detayı birlikte netleştirebiliriz.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nKısaca işletmenizin türünü ve ilk olarak tekstil mi yoksa baskılı tek kullanımlık ürünler mi sizin için daha kritik olduğunu yazarsanız, size en mantıklı yerden başlayabilirim.'
      );
    } else if (lang === 'de') {
      return (
        'Vielen Dank für Ihre Nachricht. Wir können sowohl Textil- als auch Verpackungslösungen anbieten.\n\n' +
        buildProductSummary(lang, 'mixed') +
        '\n\nWenn Sie mir kurz sagen, was für einen Betrieb Sie haben und ob wir mit Textil oder Einwegprodukten starten sollen, kann ich Ihnen einen gezielten Vorschlag machen.'
      );
    } else {
      return (
        'Thank you for your message. We can help with both textile and printed packaging solutions.\n\n' +
        buildProductSummary(lang, 'mixed') +
        "\n\nIf you tell me what type of business you run and whether textile or disposable/packaging items are more urgent, I can start from the most relevant side for you."
      );
    }
  }

  // --------------------------------
  // 7) Güvenli fallback
  // --------------------------------
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
            chatId: msg.chatId,
            isGroupMsg: msg.isGroupMsg,
            body: msg.body,
            fromMe: msg.fromMe,
          });

          // Kendi attığımız mesaja cevap verme
          if (msg.fromMe) {
            return;
          }

          // Grupları şimdilik es geç
          if (msg.isGroupMsg) {
            console.log('Grup mesajı algılandı, cevaplanmıyor.');
            return;
          }

          const sessionId = msg.chatId || msg.from;
          const session = getSession(sessionId);

          // Dil: ilk mesaja göre belirle, sonra sabit kal
          if (!session.lang) {
            session.lang = detectLanguage(msg.body || '');
          }
          const lang = session.lang;

          const replyText = buildSmartReply(msg.body, lang, session);

          // İnsan gibi hafif gecikmeli cevap (2–6 saniye)
          const delayMs = 2000 + Math.floor(Math.random() * 4000);
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
