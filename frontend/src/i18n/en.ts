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

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

/** The parts, for the test that no key is defined twice. */
export const PARTS = { lib, views, components } as const;

export default en as Messages;
