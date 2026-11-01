"use client";

import { useMutation } from "@tanstack/react-query";
import { BASE_LANGUAGES, CitiesSchema, LANGUAGES, LANGUAGE_NAMES, cityId, type City, type Language, type LocalizedText } from "@fabulka/shared";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, ChoiceLabel } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveCities } from "@/lib/admin-api";
import { Card, useAdminI18n } from "../ui";
import { errorText, issuesByPath, nextKey, RowActions, SaveBar, useRows, useSaved } from "./shared";

/** A city in the form, with a key that stays put while rows move; a new one has no id until saved. */
type CityDraft = { key: number; id: string; name: LocalizedText; freeDelivery: boolean };
const withKey = (city: City): CityDraft => ({ ...city, key: nextKey() });

/** The cities to save: a new city gets an id from its Russian (else English) name, unique in the list. */
const fromCityDrafts = (rows: CityDraft[]) => {
  const taken = rows.map((row) => row.id).filter(Boolean);
  return rows.map(({ id, name, freeDelivery }) => {
    if (id) return { id, name, freeDelivery };
    const made = cityId(name.ru || name.en || "", taken);
    taken.push(made);
    return { id: made, name, freeDelivery };
  });
};

/** Cities printed books go to, their names in every language, and where delivery is free. */
export function CitiesTab({ initial }: { initial: City[] }) {
  const { t } = useAdminI18n();
  const saved = useSaved();
  const { rows, setRows, problems, setProblems, update, move, remove } = useRows(() => initial.map(withKey));
  const save = useMutation({
    mutationFn: async (next: CityDraft[]) => {
      const parsed = CitiesSchema.safeParse(fromCityDrafts(next));
      setProblems(parsed.success ? {} : issuesByPath(parsed.error.issues));
      return parsed.success ? saveCities(parsed.data) : null;
    },
    onSuccess: (cities) => {
      if (!cities) return;
      saved({ cities });
      setRows(cities.map(withKey));
    },
  });

  return (
    <form
      data-testid="reference-cities"
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
      <SaveBar pending={save.isPending} saved={save.isSuccess && save.data !== null} error={save.error} problems={Object.keys(problems).length > 0} />
    </form>
  );
}
