import { describe, expect, it } from "vitest";
import {
  ConsentClausesSchema,
  DEFAULT_CONSENT,
  LANGUAGES,
  META_AUP_URL,
  SKIN_TONES,
  ChildLookSchema,
  heroPhotoOffered,
  lookFromModel,
  lookSentence,
  nearestSwatch,
  OTHER_COUNTRY_INFO,
  CountryEntrySchema,
} from "./index";

/** Words no look sentence may ever carry (sensitive attributes). */
const SENSITIVE = /ethnic|race|racial|asian|african|european|caucasian|latin|hispanic|arab|indian|nationality|religio|muslim|christian|jewish|disab|health|syndrome/i;

describe("the hero's look", () => {
  it("reads a model's JSON into closed values only, dropping anything else", () => {
    const look = lookFromModel({
      skin_tone_hex: "#d9a47f",
      hair_color: "red",
      hair_length: "shoulder",
      hair_texture: "curly",
      eye_color: "green",
      face_shape: "round",
      glasses: true,
      freckles: true,
      ethnicity: "anything",
      nationality: "anything",
      notes: "a long free text the illustrator must never see",
    });
    expect(look).toEqual({
      skin: "light-medium",
      skinHex: "#D9A47F",
      hairColor: "red",
      hairLength: "shoulder",
      hairTexture: "curly",
      eyes: "green",
      face: "round",
      glasses: true,
      freckles: true,
    });
    const sentence = lookSentence(look);
    expect(sentence).toBe("light medium skin tone (#D9A47F), shoulder-length curly red hair, green eyes, a round face, glasses, freckles");
    expect(sentence).not.toMatch(SENSITIVE);
  });

  it("drops values outside the lists instead of failing, and refuses an empty or refused answer", () => {
    expect(lookFromModel({ hair_color: "purple with an ethnic pattern", eye_color: "blue" })).toEqual({ eyes: "blue" });
    expect(lookFromModel({ skin_tone_hex: "brownish" , freckles: false })).toEqual({ freckles: false });
    expect(lookFromModel({ refused: true, hair_color: "red" })).toBeNull();
    expect(lookFromModel({})).toBeNull();
    expect(lookFromModel("not json")).toBeNull();
    expect(lookFromModel(null)).toBeNull();
  });

  it("picks the nearest skin swatch for any colour", () => {
    expect(nearestSwatch("#F4DACA", SKIN_TONES).id).toBe("fair");
    expect(nearestSwatch("#4B2D1E", SKIN_TONES).id).toBe("deep");
  });

  it("says nothing for no look, and builds a sentence from button picks", () => {
    expect(lookSentence(undefined)).toBe("");
    expect(lookSentence({})).toBe("");
    expect(lookSentence({ skin: "brown", hairColor: "black", hairTexture: "coily", glasses: false })).toBe(
      "brown skin tone (#8A5536), coily black hair, no glasses",
    );
  });

  it("strips unknown keys from a parent's look too", () => {
    expect(ChildLookSchema.parse({ hairColor: "blond", ethnicity: "x" })).toEqual({ hairColor: "blond" });
  });
});

describe("the consent", () => {
  it("has a default in every language: the purpose first, Meta's terms with the policy link, the guardian's checkbox", () => {
    for (const language of LANGUAGES) {
      const clauses = ConsentClausesSchema.parse(DEFAULT_CONSENT[language]);
      expect(clauses.map((c) => c.kind)).toEqual(["info", "info", "checkbox"]);
      expect(clauses[1].link?.url).toBe(META_AUP_URL);
      expect(clauses.map((c) => c.text).join(" ")).not.toMatch(/\u2014/);
    }
    expect(DEFAULT_CONSENT.en[0].text).toContain("deletes it right after the hero is created");
  });

  it("needs at least one checkbox and distinct ids", () => {
    expect(ConsentClausesSchema.safeParse([{ id: "a", kind: "info", text: "x" }]).success).toBe(false);
    expect(
      ConsentClausesSchema.safeParse([
        { id: "a", kind: "checkbox", text: "x" },
        { id: "a", kind: "info", text: "y" },
      ]).success,
    ).toBe(false);
    expect(ConsentClausesSchema.safeParse([{ id: "a", kind: "checkbox", text: "x", link: { url: "http://x.test", label: "x" } }]).success).toBe(false);
  });
});

describe("the photo path per country", () => {
  it("is on unless the country turns it off, and off for countries outside the list", () => {
    expect(heroPhotoOffered(CountryEntrySchema.parse({ code: "KZ", languages: ["kk"], currency: "KZT", print: true }))).toBe(true);
    expect(heroPhotoOffered({ heroPhoto: false })).toBe(false);
    expect(heroPhotoOffered(OTHER_COUNTRY_INFO)).toBe(false);
  });
});
