"""What Good Earth's operator and growers may tune (`tollbooth.properties`).

The operator chooses which model each reference lookup runs on: editing the
sources our own search found is light work, and a cheap model may do it; the
LLM searching for itself when ours found nothing is heavier. Both default to
the writer tier, so nothing changes until the operator tunes one.

A grower's settings follow their account from the shed tablet to the laptop —
except the bees and the season theme, which are how one screen looks and stay
on it. The frontend keeps them all in `lib/prefs.ts`.
"""

from __future__ import annotations

from tollbooth.properties import PropertySpec, llm_model_property

from goodearth_mcp.llm_answer import EFFORTS

#: Models offered beside the tiers. Any valid slug may be set.
_MODELS = ("google/gemini-2.5-flash", "openai/gpt-5-mini", "x-ai/grok-4.3", "x-ai/grok-4.5")

OPERATOR_PROPERTIES = {
    "reference_edit_model": llm_model_property(
        "Reference edit model",
        "Edits the pages our own search found into a plant profile or life cycle.",
        suggestions=_MODELS),
    "reference_edit_effort": PropertySpec(
        kind="choice", default="default", label="Reference edit reasoning",
        description="How long the edit model may reason before it answers; default sends nothing.",
        choices=EFFORTS),
    "reference_search_model": llm_model_property(
        "Reference search model",
        "Searches the web itself, when our own search found nothing to edit.",
        suggestions=_MODELS),
}

PATRON_PROPERTIES = {
    "units": PropertySpec(kind="choice", default="F", label="Units", choices=("F", "C")),
    "chart_order": PropertySpec(kind="list", default=[], label="Chart order",
                                description="The season charts' order, by measure."),
    "array_w_m": PropertySpec(kind="number", default=24, label="Array width (m)", minimum=0.5, maximum=500),
    "array_l_m": PropertySpec(kind="number", default=12, label="Array length (m)", minimum=0.5, maximum=500),
    "sell_cents": PropertySpec(kind="number", default=None, label="kWh sells for (¢)",
                               description="Empty takes the state's retail price.",
                               minimum=0, maximum=200),
    "bees": PropertySpec(kind="flag", default=True, label="Bees", follows="device"),
    "season_theme": PropertySpec(kind="choice", default="follow", label="Season",
                                 choices=("follow", "spring", "summer", "autumn", "winter"),
                                 follows="device"),
}
