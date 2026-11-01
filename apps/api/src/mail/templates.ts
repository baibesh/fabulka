import type {
  BookKind,
  Cover,
  Currency,
  Language,
  OrderStatus,
} from '@fabulka/shared';

/** A rendered email: subject, HTML and the plain-text alternative. */
export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

/** What the order emails show. */
export interface OrderMailData {
  id: string;
  bookId: string;
  bookTitle: string | null;
  recipientName: string;
  city: string;
  address: string;
  cover: Cover;
  quantity: number;
  totalKzt: number;
}

/** Order number as the parent sees it: the last characters of the id, upper-cased. */
export function orderNumber(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** "1 900 ₸" or "$3.90": a price in its own currency. */
export function money({
  amount,
  currency,
}: {
  amount: number;
  currency: Currency;
}): string {
  return currency === 'KZT' ? kzt(amount) : `$${amount.toFixed(2)}`;
}

/** 12 900 ₸ (plain spaces, so every mail client shows it the same). */
export function kzt(amount: number): string {
  return `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₸`;
}

const STATUS: Record<Language, Record<OrderStatus, string>> = {
  ru: {
    paid: 'оплачен',
    printing: 'печатается',
    shipped: 'передан в доставку',
    delivered: 'доставлен',
  },
  kk: {
    paid: 'төленді',
    printing: 'басылып жатыр',
    shipped: 'жеткізуге берілді',
    delivered: 'жеткізілді',
  },
  en: {
    paid: 'paid',
    printing: 'being printed',
    shipped: 'on its way',
    delivered: 'delivered',
  },
};

const COVER: Record<Language, Record<Cover, string>> = {
  ru: { soft: 'мягкая обложка', hard: 'твёрдая обложка' },
  kk: { soft: 'жұмсақ мұқаба', hard: 'қатты мұқаба' },
  en: { soft: 'softcover', hard: 'hardcover' },
};

const KIND: Record<Language, Record<BookKind, string>> = {
  ru: { template: 'книга из каталога', custom: 'своя история' },
  kk: { template: 'каталогтағы кітап', custom: 'өз ертегіңіз' },
  en: { template: 'a catalog book', custom: 'a story of your own' },
};

const TEXT = {
  ru: {
    hello: (name: string) => `Здравствуйте, ${name}!`,
    untitled: 'ваша книга',
    orderSubject: (n: string) => `Заказ №${n} принят — Fabulka`,
    orderIntro: (title: string) =>
      `Спасибо за заказ! Мы напечатаем «${title}» и привезём книгу вам.`,
    details: 'Детали заказа',
    number: 'Номер заказа',
    copies: (n: number) => `${n} шт.`,
    delivery: 'Доставка',
    total: 'Итого',
    track: 'Следить за заказом',
    openBook: 'Открыть книгу',
    statusSubject: (n: string, status: string) =>
      `Заказ №${n}: ${status} — Fabulka`,
    statusIntro: (title: string, status: string) =>
      `Новости о заказе книги «${title}»: теперь он ${status}.`,
    receiptSubject: 'Квитанция о покупке книги — Fabulka',
    receiptIntro: (kind: string) =>
      `Спасибо! Вы купили ещё одну книгу (${kind}). Её можно создать прямо сейчас.`,
    receiptDemo:
      'Это демо-оплата: деньги не списывались, карта не привязывалась.',
    amount: 'Сумма',
    create: 'Создать книгу',
    demoOrder:
      'Это демо: оплата не списывалась, а этапы печати и доставки показываются для примера.',
    signature: 'С теплом, команда Fabulka',
  },
  kk: {
    hello: (name: string) => `Сәлеметсіз бе, ${name}!`,
    untitled: 'сіздің кітабыңыз',
    orderSubject: (n: string) => `№${n} тапсырыс қабылданды — Fabulka`,
    orderIntro: (title: string) =>
      `Тапсырысыңызға рахмет! «${title}» кітабын басып шығарып, өзіңізге жеткіземіз.`,
    details: 'Тапсырыс мәліметтері',
    number: 'Тапсырыс нөмірі',
    copies: (n: number) => `${n} дана`,
    delivery: 'Жеткізу',
    total: 'Барлығы',
    track: 'Тапсырысты бақылау',
    openBook: 'Кітапты ашу',
    statusSubject: (n: string, status: string) =>
      `№${n} тапсырыс: ${status} — Fabulka`,
    statusIntro: (title: string, status: string) =>
      `«${title}» кітабына тапсырыс жаңалығы: қазір ол ${status}.`,
    receiptSubject: 'Кітап сатып алу түбіртегі — Fabulka',
    receiptIntro: (kind: string) =>
      `Рахмет! Сіз тағы бір кітап сатып алдыңыз (${kind}). Оны қазір жасауға болады.`,
    receiptDemo: 'Бұл демо-төлем: ақша алынған жоқ, карта байланбады.',
    amount: 'Сомасы',
    create: 'Кітап жасау',
    demoOrder:
      'Бұл демо: төлем алынған жоқ, басу мен жеткізу кезеңдері мысал ретінде көрсетіледі.',
    signature: 'Жылы лебізбен, Fabulka командасы',
  },
  en: {
    hello: (name: string) => `Hello, ${name}!`,
    untitled: 'your book',
    orderSubject: (n: string) => `Order #${n} received — Fabulka`,
    orderIntro: (title: string) =>
      `Thank you for your order! We will print “${title}” and deliver it to you.`,
    details: 'Order details',
    number: 'Order number',
    copies: (n: number) => (n === 1 ? '1 copy' : `${n} copies`),
    delivery: 'Delivery',
    total: 'Total',
    track: 'Track your order',
    openBook: 'Open the book',
    statusSubject: (n: string, status: string) =>
      `Order #${n}: ${status} — Fabulka`,
    statusIntro: (title: string, status: string) =>
      `News about your order of “${title}”: it is now ${status}.`,
    receiptSubject: 'Your book purchase receipt — Fabulka',
    receiptIntro: (kind: string) =>
      `Thank you! You bought one more book (${kind}). You can make it right away.`,
    receiptDemo:
      'This is a demo payment: no money was charged and no card was saved.',
    amount: 'Amount',
    create: 'Make a book',
    demoOrder:
      'This is a demo: nothing was charged, and the print and delivery stages are shown as an example.',
    signature: 'Warmly, the Fabulka team',
  },
} satisfies Record<Language, unknown>;

/** Sent right after a printed copy is ordered. */
export function orderConfirmation(
  order: OrderMailData,
  locale: Language,
  publicUrl: string,
): MailContent {
  const t = TEXT[locale];
  const number = orderNumber(order.id);
  const title = order.bookTitle || t.untitled;
  return layout(t.orderSubject(number), [
    paragraph(t.hello(order.recipientName)),
    paragraph(t.orderIntro(title)),
    table(t.details, [
      [t.number, number],
      [title, `${COVER[locale][order.cover]}, ${t.copies(order.quantity)}`],
      [t.delivery, `${order.city}, ${order.address}`],
      [t.total, kzt(order.totalKzt)],
    ]),
    links([
      [t.track, `${publicUrl}/orders/${order.id}?lang=${locale}`],
      [t.openBook, `${publicUrl}/books/${order.bookId}?lang=${locale}`],
    ]),
    note(t.demoOrder),
    paragraph(t.signature),
  ]);
}

/** Sent when the admin moves an order to another stage. */
export function orderStatusChanged(
  order: OrderMailData,
  status: OrderStatus,
  locale: Language,
  publicUrl: string,
): MailContent {
  const t = TEXT[locale];
  const number = orderNumber(order.id);
  const title = order.bookTitle || t.untitled;
  const label = STATUS[locale][status];
  return layout(t.statusSubject(number, label), [
    paragraph(t.hello(order.recipientName)),
    paragraph(t.statusIntro(title, label)),
    table(t.details, [
      [t.number, number],
      [t.total, kzt(order.totalKzt)],
    ]),
    links([
      [t.track, `${publicUrl}/orders/${order.id}?lang=${locale}`],
      [t.openBook, `${publicUrl}/books/${order.bookId}?lang=${locale}`],
    ]),
    paragraph(t.signature),
  ]);
}

/** Sent after the paywall's demo checkout for one more book. */
export function purchaseReceipt(
  purchase: { kind: BookKind; price: { amount: number; currency: Currency } },
  locale: Language,
  publicUrl: string,
): MailContent {
  const t = TEXT[locale];
  return layout(t.receiptSubject, [
    paragraph(t.receiptIntro(KIND[locale][purchase.kind])),
    table(t.details, [[t.amount, money(purchase.price)]]),
    note(t.receiptDemo),
    links([[t.create, `${publicUrl}/catalog?lang=${locale}`]]),
    paragraph(t.signature),
  ]);
}

// ---- Building blocks: each renders to HTML and to plain text -------------------

interface Block {
  html: string;
  text: string;
}

function paragraph(value: string): Block {
  return {
    html: `<p style="margin:0 0 16px">${escapeHtml(value)}</p>`,
    text: value,
  };
}

function note(value: string): Block {
  return {
    html: `<p style="margin:0 0 16px;color:#6b6b6b;font-size:13px">${escapeHtml(value)}</p>`,
    text: value,
  };
}

function table(caption: string, rows: [string, string][]): Block {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b6b6b">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return {
    html: `<p style="margin:0 0 8px;font-weight:bold">${escapeHtml(caption)}</p><table style="border-collapse:collapse;margin:0 0 16px">${cells}</table>`,
    text: [caption, ...rows.map(([label, value]) => `${label}: ${value}`)].join(
      '\n',
    ),
  };
}

function links(items: [string, string][]): Block {
  return {
    html: `<p style="margin:0 0 16px">${items
      .map(
        ([label, url]) =>
          `<a href="${escapeHtml(url)}" style="display:inline-block;margin:0 12px 8px 0;padding:10px 16px;background:#f2994a;color:#ffffff;border-radius:8px;text-decoration:none">${escapeHtml(label)}</a>`,
      )
      .join('')}</p>`,
    text: items.map(([label, url]) => `${label}: ${url}`).join('\n'),
  };
}

function layout(subject: string, blocks: Block[]): MailContent {
  return {
    subject,
    html: `<!doctype html><html><body style="margin:0;background:#fdf8f3"><div style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2d2d2d"><p style="margin:0 0 24px;font-size:22px;font-weight:bold;color:#f2994a">Fabulka</p>${blocks
      .map((block) => block.html)
      .join('')}</div></body></html>`,
    text: blocks.map((block) => block.text).join('\n\n'),
  };
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
