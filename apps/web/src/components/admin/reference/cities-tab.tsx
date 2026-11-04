"use client";

import { useMutation } from "@/lib/query";
import {
  BASE_LANGUAGES,
  CITY_ID_TAKEN,
  CountryCitiesSchema,
  LANGUAGES,
  LANGUAGE_NAMES,
  SCOPE_FORBIDDEN,
  citiesOf,
  cityId,
  cityName,
  type AdminReference,
  type City,
  type Language,
  type LocalizedText,
} from "@fabulka/shared";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Flag } from "@/components/ui/flag";
import { useCountryName } from "@/hooks/use-country-name";
import { ApiError } from "@/lib/api";
import { saveCountryCities } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { errorText, issuesByPath, nextKey, RowActions, SaveBar, useRows, useSaved } from "./shared";

/** A city in the form, with a key that stays put while rows move; a new one has no id until saved. */
type CityDraft = { key: number; id: string; name: LocalizedText; freeDelivery: boolean };
const withKey = (city: City): CityDraft => ({ ...city, key: nextKey() });

/**
 * The cities to save: a new city gets an id from its Russian (else English) name, unique among every
 * country's cities (`others`: ids the other countries' cities have).
 */
const fromCityDrafts = (rows: CityDraft[], country: string, others: readonly string[]) => {
  const taken = [...others, ...rows.map((row) => row.id).filter(Boolean)];
  return rows.map(({ id, name, freeDelivery }) => {
    if (id) return { id, country, name, freeDelivery };
    const made = cityId(name.ru || name.en || "", taken);
    taken.push(made);
    return { id: made, country, name, freeDelivery };
  });
};

/**
 * One country's cities printed books go to, their names in every language, and where delivery is
 * free. Ids never change once made: orders refer to them.
 */
export function CitiesTab({ reference, country }: { reference: AdminReference; country: string }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const others = reference.cities.filter((c) => c.country !== country);
  const { rows, setRows, problems, setProblems, update, move, remove } = useRows(() => citiesOf(country, reference.cities).map(withKey));
  const save = useMutation({
    mutationFn: async (next: CityDraft[]) => {
      const parsed = CountryCitiesSchema.safeParse(fromCityDrafts(next, country, others.map((c) => c.id)));
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? saveCountryCities(country, parsed.data) : null;
    },
    onSuccess: (cities) => {
      if (!cities) return;
      saved({ cities: [...others, ...cities] });
      setRows(cities.map(withKey));
    },
  });
  const failure =
    save.error instanceof ApiError && save.error.code === SCOPE_FORBIDDEN
      ? new Error(t("admin.scope.forbidden"))
      : save.error instanceof ApiError && save.error.code === CITY_ID_TAKEN
        ? new Error(t("admin.reference.error.cityDuplicate"))
        : save.error;

  return (
    <form
      data-testid="reference-cities"
      data-country={country}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(rows);
      }}
      className="flex flex-col gap-4"
    >
      <Card>
        <p className="text-sm text-muted">{t("admin.reference.cities.hint")}</p>
        {problems[""] && <p className={errorText}>{t("admin.reference.error.citiesEmpty")}</p>}
        <ol className="flex flex-col gap-3">
          {rows.map((city, i) => (
            <li key={city.key} data-testid="city-row" data-id={city.id} className="flex flex-col gap-3 rounded-xl bg-background p-3 lg:flex-row lg:items-start">
              <span className="hidden w-6 pt-2 text-right text-sm font-bold text-muted lg:block">{i + 1}</span>
              <div className="flex flex-1 flex-col gap-2">
                <div className="grid gap-3 sm:grid-cols-3">
                  {LANGUAGES.map((lang) => {
                    const problem = problems[`${i}.name.${lang}`];
                    const base = (BASE_LANGUAGES as readonly Language[]).includes(lang);
                    return (
                      <Field
                        key={lang}
                        label={
                          <span className="text-xs text-muted">
                            {LANGUAGE_NAMES[lang]}
                            {!base && <span className="ml-1 font-normal">({t("admin.reference.faq.optional")})</span>}
                          </span>
                        }
                        error={
                          problem &&
                          t(problem === "custom" && lang === "ru" && city.name.ru ? "admin.reference.error.cityDuplicate" : "admin.reference.error.cityName")
                        }
                        errorTestId="reference-error"
                      >
                        <Input
                          data-testid={`city-${lang}`}
                          value={city.name[lang] ?? ""}
                          onChange={(e) => update(i, (row) => ({ name: { ...row.name, [lang]: e.target.value } }))}
                        />
                      </Field>
                    );
                  })}
                </div>
                {/* Orders refer to the city by this id: made from the name on the first save, then kept. */}
                {city.id && <span data-testid="city-id" className="font-mono text-xs text-muted">{city.id}</span>}
                {problems[`${i}.id`] && (
                  <span data-testid="reference-error" className={errorText}>
                    {t("admin.reference.error.cityDuplicate")}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 lg:pt-6">
                <ChoiceLabel className="whitespace-nowrap">
                  <Checkbox data-testid="city-free" checked={city.freeDelivery} onChange={(e) => update(i, () => ({ freeDelivery: e.target.checked }))} />
                  {t("admin.reference.city.free")}
                </ChoiceLabel>
                <RowActions
                  prefix="city"
                  index={i}
                  count={rows.length}
                  labels={{ up: t("admin.reference.city.up"), down: t("admin.reference.city.down"), remove: t("admin.reference.city.remove") }}
                  onMove={(by) => move(i, by)}
                  onRemove={() => remove(i)}
                />
              </div>
            </li>
          ))}
        </ol>
        <Button
          variant="secondary"
          data-testid="city-add"
          icon={<Plus className="size-4" />}
          onClick={() => setRows((list) => [...list, { key: nextKey(), id: "", name: {}, freeDelivery: false }])}
          className="self-start"
        >
          {t("admin.reference.city.add")}
        </Button>
      </Card>
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={failure} problems={Object.keys(problems).length > 0} />
    </form>
  );
}

/** Every country's cities, read-only, for the global view: cities belong to a country, picked in the switcher. */
export function AllCities({ reference }: { reference: AdminReference }) {
  const { t, locale } = useAdminI18n();
  const countryName = useCountryName("admin");
  const countries = [...new Set(reference.cities.map((c) => c.country))];
  return (
    <Card data-testid="reference-cities-all">
      <p className="text-sm text-muted">{t("admin.reference.cities.pick")}</p>
      {countries.map((code) => (
        <div key={code} className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-semibold">
            <Flag code={code} />
            {countryName(code)}
          </p>
          <p className="text-sm text-muted">
            {citiesOf(code, reference.cities)
              .map((c) => cityName(c, locale))
              .join(", ")}
          </p>
        </div>
      ))}
    </Card>
  );
}
