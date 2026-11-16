/** Good Earth's words in this language, in the same three parts as English. */

import type { Translation } from "./en.ts";
import components from "./es/components.ts";
import lib from "./es/lib.ts";
import views from "./es/views.ts";

const words: Translation = { ...lib, ...views, ...components };

export default words;
