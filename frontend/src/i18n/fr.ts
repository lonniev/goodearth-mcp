/** Good Earth's words in this language, in the same three parts as English. */

import type { Translation } from "./en.ts";
import components from "./fr/components.ts";
import lib from "./fr/lib.ts";
import views from "./fr/views.ts";

const words: Translation = { ...lib, ...views, ...components };

export default words;
