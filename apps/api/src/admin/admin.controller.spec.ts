import {
  BUILTIN_ROLES,
  DEFAULT_PRICES,
  SUPER_ROLE,
  accessOf,
} from '@fabulka/shared';
import type { AdminSession } from './admin-auth.service';
import { AdminController } from './admin.controller';

const session = (access: ReturnType<typeof accessOf>): AdminSession => ({
  ...access,
  who: null,
  staffId: null,
});
const SUPER = session(accessOf([SUPER_ROLE], BUILTIN_ROLES, []));
const DE = session(accessOf(['country_manager'], BUILTIN_ROLES, ['DE']));

function controller() {
  const reference = {
    setPrices: jest.fn().mockResolvedValue(DEFAULT_PRICES),
    setCountryPrices: jest.fn((code: string) =>
      Promise.resolve({ [code]: DEFAULT_PRICES }),
    ),
    setCities: jest.fn().mockResolvedValue([]),
    setCountryCities: jest.fn().mockResolvedValue([]),
    setDeliveryFee: jest.fn().mockResolvedValue(DEFAULT_PRICES),
    setCountryDelivery: jest.fn((code: string) =>
      Promise.resolve({ [code]: { feeKzt: 0, freeEverywhere: true } }),
    ),
    setCountryFormats: jest.fn((code: string) =>
      Promise.resolve({ [code]: {} }),
    ),
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
    expect(await code(admin.setPrices(DEFAULT_PRICES, DE, 'de'))).toBe('ok');
    expect(reference.setCountryPrices).toHaveBeenCalledWith(
      'DE',
      DEFAULT_PRICES,
    );
    expect(await code(admin.setPrices(DEFAULT_PRICES, DE, 'KZ'))).toBe(
      'scope_forbidden',
    );
    expect(await code(admin.setPrices(DEFAULT_PRICES, DE))).toBe(
      'scope_forbidden',
    );
    expect(await code(admin.clearCountryPrices(DE, 'KZ'))).toBe(
      'scope_forbidden',
    );
    expect(reference.setPrices).not.toHaveBeenCalled();
  });

  it('lets the superadmin change the global prices and any country', async () => {
    const { admin, reference } = controller();
    await admin.setPrices(DEFAULT_PRICES, SUPER);
    expect(reference.setPrices).toHaveBeenCalled();
    await admin.setPrices(DEFAULT_PRICES, SUPER, 'KZ');
    expect(reference.setCountryPrices).toHaveBeenCalledWith(
      'KZ',
      DEFAULT_PRICES,
    );
  });

  it("lets a manager change only their countries' landing", async () => {
    const { admin, reference } = controller();
    expect(await code(admin.setLanding(landing, DE, 'DE'))).toBe('ok');
    expect(await code(admin.setLanding(landing, DE, 'KZ'))).toBe(
      'scope_forbidden',
    );
    expect(await code(admin.clearLanding(DE, 'AT'))).toBe('scope_forbidden');
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
    expect(await code(admin.setCities([berlin], DE, 'DE'))).toBe('ok');
    expect(reference.setCountryCities).toHaveBeenCalledWith('DE', [berlin]);
    expect(await code(admin.setCities([berlin], DE, 'KZ'))).toBe(
      'scope_forbidden',
    );
    expect(await code(admin.setCities([berlin], DE))).toBe('scope_forbidden');
    expect(reference.setCities).not.toHaveBeenCalled();
    // A bad body is a 400, checked against the per-country schema.
    await expect(admin.setCities([{ id: 'x y' }], DE, 'DE')).rejects.toThrow(
      'Validation failed',
    );
  });

  it("lets a manager set their country's delivery and formats, the superadmin the global fee", async () => {
    const { admin, reference } = controller();
    const rule = { feeKzt: 900, freeEverywhere: false };
    expect(await code(admin.setDelivery(rule, DE, 'DE'))).toBe('ok');
    expect(await code(admin.setDelivery(rule, DE, 'KZ'))).toBe(
      'scope_forbidden',
    );
    expect(await code(admin.setDelivery(rule, DE))).toBe('scope_forbidden');
    expect(await code(admin.setCountryFormats({}, DE, 'KZ'))).toBe(
      'scope_forbidden',
    );
    expect(await code(admin.setCountryFormats({}, DE, 'DE'))).toBe('ok');
    await admin.setDelivery(rule, SUPER);
    expect(reference.setDeliveryFee).toHaveBeenCalledWith(900);
  });
});
