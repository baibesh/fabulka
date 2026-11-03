import {
  BUILTIN_ROLES,
  DEFAULT_PRICES,
  SUPER_ROLE,
  accessOf,
} from '@fabulka/shared';
import type { AdminSession } from './admin-auth.service';
import { AuditTrail } from '../audit/audit.interceptor';
import { AdminController } from './admin.controller';

const session = (access: ReturnType<typeof accessOf>): AdminSession => ({
  ...access,
  who: null,
  staffId: null,
});
const SUPER = session(accessOf([SUPER_ROLE], BUILTIN_ROLES, []));
const DE = session(accessOf(['country_manager'], BUILTIN_ROLES, ['DE']));

const euroBooks = {
  currency: 'EUR' as const,
  books: { template: 4_90, custom: 6_90 },
};
const kztBooks = {
  currency: 'KZT' as const,
  books: { template: 1_900_00, custom: 2_900_00 },
};

function controller() {
  const reference = {
    setPrices: jest.fn().mockResolvedValue(DEFAULT_PRICES),
    setDefaultBookPrices: jest.fn().mockResolvedValue(DEFAULT_PRICES),
    setCountryPrices: jest.fn((code: string, prices: unknown) =>
      Promise.resolve({ [code]: prices }),
    ),
    setCities: jest.fn().mockResolvedValue([]),
    setCountryCities: jest.fn().mockResolvedValue([]),
    setDeliveryFee: jest.fn().mockResolvedValue(DEFAULT_PRICES),
    setCountryDelivery: jest.fn((code: string) =>
      Promise.resolve({
        [code]: { currency: 'EUR', fee: 0, freeEverywhere: true },
      }),
    ),
    setCountryFormats: jest.fn((code: string) =>
      Promise.resolve({ [code]: {} }),
    ),
    admin: jest.fn().mockResolvedValue({
      prices: DEFAULT_PRICES,
      cities: [],
      countryPrices: {},
      landing: {},
      countryDelivery: {},
      countryFormats: {},
      faq: [],
      blocked: { extra: [] },
    }),
    setLanding: jest.fn((code: string) =>
      Promise.resolve({
        [code]: { hero: {}, faqHidden: [], faq: [], hiddenSections: [] },
      }),
    ),
  };
  const none = {} as never;
  const admin = new AdminController(
    none,
    none,
    none,
    none,
    none,
    reference as never,
    none,
    none,
    none,
    none,
  );
  return { admin, reference };
}

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { getResponse(): { code?: string } }) => error.getResponse().code,
  );

const landing = { hero: {}, faqHidden: [], faq: [], hiddenSections: [] };

describe('AdminController reference routes: country scope', () => {
  it("lets a manager change their country's prices, never another's nor the global list", async () => {
    const { admin, reference } = controller();
    const trail = new AuditTrail();
    expect(await code(admin.setPrices(euroBooks, DE, trail, 'de'))).toBe('ok');
    expect(reference.setCountryPrices).toHaveBeenCalledWith('DE', euroBooks);
    // The audit event carries the currency.
    expect(trail.summary?.data).toEqual({ currency: 'EUR' });
    expect(trail.summary?.changes).toContainEqual({
      path: 'currency',
      after: 'EUR',
    });
    expect(
      await code(admin.setPrices(euroBooks, DE, new AuditTrail(), 'KZ')),
    ).toBe('scope_forbidden');
    expect(await code(admin.setPrices(euroBooks, DE, new AuditTrail()))).toBe(
      'scope_forbidden',
    );
    expect(
      await code(admin.clearCountryPrices(DE, new AuditTrail(), 'KZ')),
    ).toBe('scope_forbidden');
    expect(reference.setDefaultBookPrices).not.toHaveBeenCalled();
  });

  it("lets the superadmin change a currency's default prices and any country", async () => {
    const { admin, reference } = controller();
    const trail = new AuditTrail();
    await admin.setPrices(kztBooks, SUPER, trail);
    expect(reference.setDefaultBookPrices).toHaveBeenCalledWith(kztBooks);
    expect(trail.targetId).toBe('KZT');
    await admin.setPrices(kztBooks, SUPER, new AuditTrail(), 'KZ');
    expect(reference.setCountryPrices).toHaveBeenCalledWith('KZ', kztBooks);
  });

  it("lets a manager change only their countries' landing", async () => {
    const { admin, reference } = controller();
    expect(
      await code(admin.setLanding(landing, DE, new AuditTrail(), 'DE')),
    ).toBe('ok');
    expect(
      await code(admin.setLanding(landing, DE, new AuditTrail(), 'KZ')),
    ).toBe('scope_forbidden');
    expect(await code(admin.clearLanding(DE, new AuditTrail(), 'AT'))).toBe(
      'scope_forbidden',
    );
    expect(reference.setLanding).toHaveBeenCalledTimes(1);
  });
});

describe('AdminController per-country reference routes', () => {
  const berlin = {
    id: 'berlin',
    country: 'DE',
    name: { ru: 'Берлин', en: 'Berlin' },
    freeDelivery: false,
  };

  it("lets a manager change their country's cities only, never every country's list", async () => {
    const { admin, reference } = controller();
    expect(
      await code(admin.setCities([berlin], DE, new AuditTrail(), 'DE')),
    ).toBe('ok');
    expect(reference.setCountryCities).toHaveBeenCalledWith('DE', [berlin]);
    expect(
      await code(admin.setCities([berlin], DE, new AuditTrail(), 'KZ')),
    ).toBe('scope_forbidden');
    expect(await code(admin.setCities([berlin], DE, new AuditTrail()))).toBe(
      'scope_forbidden',
    );
    expect(reference.setCities).not.toHaveBeenCalled();
    // A bad body is a 400, checked against the per-country schema.
    await expect(
      admin.setCities([{ id: 'x y' }], DE, new AuditTrail(), 'DE'),
    ).rejects.toThrow('Validation failed');
  });

  it("lets a manager set their country's delivery and formats, the superadmin the global fee", async () => {
    const { admin, reference } = controller();
    const rule = { currency: 'EUR' as const, fee: 9_00, freeEverywhere: false };
    expect(
      await code(admin.setDelivery(rule, DE, new AuditTrail(), 'DE')),
    ).toBe('ok');
    expect(
      await code(admin.setDelivery(rule, DE, new AuditTrail(), 'KZ')),
    ).toBe('scope_forbidden');
    expect(await code(admin.setDelivery(rule, DE, new AuditTrail()))).toBe(
      'scope_forbidden',
    );
    expect(
      await code(admin.setCountryFormats({}, DE, new AuditTrail(), 'KZ')),
    ).toBe('scope_forbidden');
    expect(
      await code(admin.setCountryFormats({}, DE, new AuditTrail(), 'DE')),
    ).toBe('ok');
    await admin.setDelivery(rule, SUPER, new AuditTrail());
    expect(reference.setDeliveryFee).toHaveBeenCalledWith('EUR', 9_00);
  });
});
