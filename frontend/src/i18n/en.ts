/**
 * Every word Good Earth's own pages say, in English: the bedrock the other
 * languages translate. Split by source folder so each part stays readable.
 *
 * A `{{name}}` is filled with a word or number; a `<name/>` or `<name>…</name>`
 * is drawn as an element (a link, a styled number). A translation keeps each one
 * exactly as written and may move it within the sentence. "Good Earth", plant
 * and animal names, units and emoji stay as they are.
 */

import components from "./en/components.ts";
import lib from "./en/lib.ts";
import views from "./en/views.ts";

export const en = { ...lib, ...views, ...components };

/** A key as written in the catalog, plural suffix and all. */
export type EnglishKey = keyof typeof en;
type StripPlural<K> = K extends `${infer Base}_${"zero" | "one" | "two" | "few" | "many" | "other"}` ? Base : K;
/** A key as code asks for it: `x` stands for `x_one` / `x_other`, read with `{ count }`. */
export type MessageKey = StripPlural<EnglishKey>;
export type Messages = Record<EnglishKey, string>;
type PluralBase = EnglishKey extends infer K ? (K extends `${infer Base}_other` ? Base : never) : never;
/** One language's words: English's keys, plus the plural forms that language has beyond English's two. */
export type Translation = Partial<Messages> & Partial<Record<`${PluralBase}_${"zero" | "two" | "few" | "many"}`, string>>;

/** The parts, for the test that no key is defined twice. */
export const PARTS = { lib, views, components } as const;

export default en as Messages;
