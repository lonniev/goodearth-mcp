/** Good Earth's words in this language, in the same three parts as English. */

import type { Translation } from "./en.ts";
import components from "./hi/components.ts";
import lib from "./hi/lib.ts";
import views from "./hi/views.ts";

const words: Translation = { ...lib, ...views, ...components };

export default words;
