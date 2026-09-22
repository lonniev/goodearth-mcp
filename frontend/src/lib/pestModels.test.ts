// Run: node --experimental-strip-types --test src/lib/pestModels.test.ts

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makePest, makeWatch } from "./pestModels.ts";

describe("blank stages mean watch it", () => {
  it("does not reject a pest with nothing to count", () => {
    // THE BUG. Tapping a modelled stage filled the name; "+ Pest" then refused
    // with a sentence about the format of a field the grower had never
    // touched, and there was no way forward that did not involve inventing a
    // threshold. A grower watches voles, slugs and wasps — creatures with no
    // degree-day model at all.
    const made = makePest("Spotted lanternfly", 50, "", "b1");
    assert.notEqual(typeof made, "string", `refused: ${made}`);
    assert.equal((made as { watch?: boolean }).watch, true);
    assert.deepEqual((made as { stages: unknown[] }).stages, []);
  });

  it("treats whitespace as blank, not as a malformed stage", () => {
    const made = makePest("Vole", 50, "   ", "b1");
    assert.equal((made as { watch?: boolean }).watch, true);
  });

  it("still demands a name, since a row about nothing is not a row", () => {
    assert.equal(typeof makePest("", 50, "", "b1"), "string");
    assert.equal(typeof makeWatch("  ", "b1"), "string");
  });

  it("still rejects stages that were typed and are malformed", () => {
    // The message earns its place here: the grower DID touch the field.
    const made = makePest("Codling moth", 50, "first flight", "b1");
    assert.equal(typeof made, "string");
    assert.match(made as string, /first flight 375/);
  });

  it("keeps the model path intact when stages are given", () => {
    const made = makePest("Codling moth", 50, "first flight 375", "b1");
    assert.deepEqual((made as { stages: unknown[] }).stages,
      [{ stage: "first flight", gdd: 375 }]);
    assert.equal((made as { watch?: boolean }).watch, undefined);
  });

  it("carries the reference through either path", () => {
    const ref = { taxonId: 53227, scientificName: "Boisea trivittata" };
    for (const stages of ["", "first flight 375"]) {
      const made = makePest("Eastern Boxelder Bug", 50, stages, "b1", undefined, ref);
      assert.equal((made as { taxon_id?: number }).taxon_id, 53227);
      assert.equal((made as { scientific_name?: string }).scientific_name,
        "Boisea trivittata");
    }
  });
});

describe("the form a pest is named in", () => {
  const view = () =>
    readFileSync(new URL("../views/Pests.tsx", import.meta.url), "utf8");

  it("names a creature from the catalogue rather than a typed hope", () => {
    // A misspelt pest is a row that no later lookup can key on, and the
    // catalogue that already knows creatures was two components away.
    assert.match(view(), /<SpeciesPicker[\s\S]*?kingdom="animals"/);
  });

  it("searches animals, not insects", () => {
    // This grower's own list already holds a chipmunk and a slug. Neither is
    // an insect, and a picker that could not find them would have made the
    // page refuse rows it already shows.
    assert.doesNotMatch(view(), /<SpeciesPicker[\s\S]{0,200}kingdom="insects"/);
  });

  it("still takes a name the catalogue has not heard of", () => {
    // "Pest" is the grower's word for whatever is eating the crop. Refusing
    // one because iNaturalist has no row for it would cap what they record.
    assert.match(view(), /onText=\{setPestName\}/);
    assert.match(view(), /picked\?\.commonName \|\| picked\?\.scientificName \|\| pestName/);
  });

  it("carries the taxon through to the record when one was resolved", () => {
    assert.match(view(), /taxonId: picked\.id, scientificName: picked\.scientificName/);
  });

  it("puts the act at the end of the fields rather than on a row of its own", () => {
    // A tester asked for the button to sit AFTER the boxes and it still does;
    // what it gives up is a whole row of the page to say so.
    const form = view().slice(view().indexOf('<form id="new-pest"'), view().indexOf("</form>"));
    assert.match(form, /<IconButton path=\{ICON\.bug\} label="Pest" hideLabel/);
    assert.ok(form.indexOf("IconButton") > form.indexOf("pest-stages"),
      "the button must come after the fields it acts on");
  });
});
