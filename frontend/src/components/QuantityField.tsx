// How much, in the grower's own unit — one field, not two.
//
// "500" and "seeds" are two halves of one thought, and asking for them in two
// separately-labelled boxes made the grower say the same thing twice: once to
// the field called On hand and once to the field called Unit. Here it reads as
// it is spoken — 500 seeds, 10 pounds — inside a single bordered control under
// a single label.
//
// Still stored as two, because they are two facts to everything downstream: a
// total can be summed and a unit cannot.

export default function QuantityField({
  id, label, amount, unit, units, placeholder, unitPlaceholder, onAmount, onUnit, onKeyDown,
}: {
  id: string;
  label: string;
  amount: string;
  unit: string;
  /// Units to suggest. The grower's own, where the page knows them.
  units?: readonly string[];
  placeholder?: string;
  unitPlaceholder?: string;
  onAmount: (v: string) => void;
  onUnit: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const listId = `${id}-units`;
  return (
    <span className="block text-[11px] text-ink-soft">
      <label htmlFor={id}>{label}</label>
      {/* The border is on the group, and the two inputs inside it are bare.
          That is what makes it read as one control rather than as two that
          happen to be adjacent. */}
      <span className="mt-0.5 flex items-stretch rounded border border-rule bg-white
        focus-within:border-honey">
        <input id={id} inputMode="decimal" value={amount} onKeyDown={onKeyDown}
          placeholder={placeholder ?? "500"}
          onChange={(e) => onAmount(e.target.value)}
          className="w-16 min-w-0 bg-transparent px-2 py-1.5 text-right text-[13px] text-ink
            outline-none placeholder:text-ink-soft/50" />
        <input list={units?.length ? listId : undefined} value={unit} onKeyDown={onKeyDown}
          aria-label={`${label} unit`} placeholder={unitPlaceholder ?? "seeds"}
          onChange={(e) => onUnit(e.target.value)}
          className="w-full min-w-0 bg-transparent py-1.5 pr-2 text-[13px] text-ink
            outline-none placeholder:text-ink-soft/50" />
        {units?.length ? (
          <datalist id={listId}>
            {units.map((u) => <option key={u} value={u} />)}
          </datalist>
        ) : null}
      </span>
    </span>
  );
}
