import { ChildLookSchema, LANGUAGES } from "@fabulka/shared";
import type { FieldPath } from "react-hook-form";
import { z } from "zod";

export const FormSchema = z.object({
  name: z.string().trim().min(1).max(40),
  age: z.string(),
  gender: z.enum(["boy", "girl"]),
  interests: z.string().trim().min(1),
  pet: z.string().trim().max(60),
  city: z.string().trim().min(1).max(60),
  language: z.enum(LANGUAGES),
  /** "" lets the API pick a method by age. */
  methodology: z.string(),
  theme: z.string().trim().max(200),
  toyName: z.string().trim().max(40),
  answers: z.record(z.string(), z.string()),
  /** How the hero is drawn: from the child's photo (signed in, with consent) or a description. */
  heroMode: z.enum(["description", "photo"]),
  /** The look picked with buttons (the description path); empty: the illustrator decides. */
  look: ChildLookSchema,
});
export type FormValues = z.infer<typeof FormSchema>;

/** The wizard's steps in order; "voice" is offered only while voice input is on. "look" comes before the hero is drawn. */
export const STEPS = ["voice", "child", "look", "story", "toy", "review"] as const;
export type Step = (typeof STEPS)[number];

/** Fields each step checks before moving on; answers to a template's questions are checked apart. */
export const STEP_FIELDS: Record<Step, FieldPath<FormValues>[]> = {
  voice: [],
  child: ["name", "age", "gender", "language", "interests", "city"],
  look: [],
  story: ["theme", "methodology"],
  toy: ["pet", "toyName"],
  review: [],
};

export const ages = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => String(i + min));

export function splitInterests(interests: string) {
  return interests.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
}
