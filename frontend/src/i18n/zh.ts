/** Good Earth's words in this language, in the same three parts as English. */

import type { Translation } from "./en.ts";
import components from "./zh/components.ts";
import lib from "./zh/lib.ts";
import views from "./zh/views.ts";

const words: Translation = { ...lib, ...views, ...components };

export default words;
