/** Good Earth's words in this language, in the same three parts as English. */

import type { Translation } from "./en.ts";
import components from "./ja/components.ts";
import lib from "./ja/lib.ts";
import views from "./ja/views.ts";

const words: Translation = { ...lib, ...views, ...components };

export default words;
