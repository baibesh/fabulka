import { DEFAULT_LANGUAGE, LANGUAGES } from '@fabulka/shared';

/** The site's address prefix of a language: none for the default one (English). */
const prefix = (locale: string) =>
  locale === DEFAULT_LANGUAGE ? '' : `/${locale}`;
import {
  price as formatPrice,
  orderConfirmation,
  orderNumber,
  orderStatusChanged,
  purchaseReceipt,
} from './templates';

const order = {
  id: 'cmh1x2y3z4abcdefgh',
  bookId: 'book-1',
  bookTitle: 'Арман и <снежный> барс',
  recipientName: 'Айгерим',
  city: 'Алматы',
  address: 'ул. Абая, 1',
  cover: 'hard' as const,
  quantity: 2,
  total: { amount: 29_800_00, currency: 'KZT' as const },
};
const site = 'https://fabulka.com';

describe('mail templates', () => {
  it.each(LANGUAGES)('renders the order confirmation in %s', (locale) => {
    const mail = orderConfirmation(order, locale, site);
    expect(mail.subject).toContain(orderNumber(order.id));
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain(
        locale === 'en'
          ? '₸29,800'
          : locale === 'de' || locale === 'es'
            ? '29.800 ₸'
            : '29 800 ₸',
      );
      expect(body).toContain(`${site}${prefix(locale)}/orders/${order.id}`);
      expect(body).toContain(`${site}${prefix(locale)}/books/book-1`);
      expect(body).not.toContain('?lang=');
      expect(body).toContain('Айгерим');
    }
    expect(mail.html).toContain('&lt;снежный&gt;');
    expect(mail.html).not.toContain('<снежный>');
  });

  it.each(LANGUAGES)('renders the status change in %s', (locale) => {
    const mail = orderStatusChanged(order, 'shipped', locale, site);
    expect(mail.subject).toContain(orderNumber(order.id));
    expect(mail.text).toContain(`${site}${prefix(locale)}/orders/${order.id}`);
    expect(mail.text).not.toContain('undefined');
  });

  it('links Russian mail to /ru and English mail to unprefixed addresses', () => {
    expect(orderStatusChanged(order, 'shipped', 'ru', site).text).toContain(
      `${site}/ru/orders/${order.id}`,
    );
    expect(orderStatusChanged(order, 'shipped', 'en', site).text).toContain(
      `${site}/orders/${order.id}`,
    );
  });

  it.each(LANGUAGES)('renders the purchase receipt in %s', (locale) => {
    const mail = purchaseReceipt(
      { kind: 'custom', price: { amount: 2_900_00, currency: 'KZT' } },
      locale,
      site,
    );
    expect(mail.text).toContain(
      formatPrice({ amount: 2_900_00, currency: 'KZT' }, locale),
    );
    expect(mail.text).toContain('2');
    expect(mail.html).toContain(`${site}${prefix(locale)}/catalog`);
  });

  it('says in Russian that nothing was charged', () => {
    expect(
      purchaseReceipt(
        { kind: 'template', price: { amount: 1_900_00, currency: 'KZT' } },
        'ru',
        site,
      ).text,
    ).toContain('деньги не списывались');
  });

  it('writes to Spanish and German parents in their language', () => {
    const price = { amount: 3_90, currency: 'USD' as const };
    expect(
      purchaseReceipt({ kind: 'custom', price }, 'es', site).text,
    ).toContain('una historia propia');
    expect(orderStatusChanged(order, 'printing', 'de', site).subject).toBe(
      `Bestellung Nr. ${orderNumber(order.id)}: wird gedruckt – Fabulka`,
    );
  });

  it('shows a dollar purchase in dollars', () => {
    const mail = purchaseReceipt(
      { kind: 'template', price: { amount: 3_90, currency: 'USD' } },
      'en',
      site,
    );
    expect(mail.text).toContain('$3.90');
    expect(mail.text).not.toContain('₸');
  });

  it('shows a euro order in euros, written the German way for German parents', () => {
    const euro = {
      ...order,
      total: { amount: 62_70, currency: 'EUR' as const },
    };
    expect(orderConfirmation(euro, 'de', site).text).toContain('62,70 €');
    expect(orderConfirmation(euro, 'en', site).text).toContain('€62.70');
  });

  it('formats prices with plain spaces, and order numbers', () => {
    expect(formatPrice({ amount: 1_500_00, currency: 'KZT' }, 'ru')).toBe(
      '1 500 ₸',
    );
    expect(formatPrice({ amount: 149_000_00, currency: 'KZT' }, 'kk')).toBe(
      '149 000 ₸',
    );
    expect(orderNumber('abcdefghijkl')).toBe('EFGHIJKL');
  });
});
