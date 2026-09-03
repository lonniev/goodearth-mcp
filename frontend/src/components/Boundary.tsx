// A failure in one view must not take the whole page.
//
// Written after a watched pest with no stages threw inside the chart builder
// and left the grower looking at a blank background — no error, no chart, no
// ledger, no navigation. The bug was a one-line guard; the damage was total,
// because React unmounts the tree when a render throws and nothing here caught
// it.
//
// The record is full of rows that legitimately carry less than the code
// expects: a crop with no heat target, a pest with no stages, a creature with
// no event. Each one is a chance for this to happen again, so the answer is
// not only to fix them but to make the failure local when one is missed.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /// What failed, in the grower's words — "the season chart", not "HeatLedger".
  what: string;
}

interface State {
  message: string;
}

export default class Boundary extends Component<Props, State> {
  state: State = { message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    // Keep it in the console for whoever is looking; the page stays usable.
    console.error("Good Earth: a view failed", err, info.componentStack);
  }

  /// Recover when the grower changes what they are looking at, so a bad row on
  /// one block does not follow them to the next.
  componentDidUpdate(prev: Props): void {
    if (prev.children !== this.props.children && this.state.message) {
      this.setState({ message: "" });
    }
  }

  render(): ReactNode {
    if (!this.state.message) return this.props.children;
    return (
      <div className="rounded-md border border-clay/30 bg-clay/10 p-4 text-[13px] text-clay">
        <p className="font-semibold">{this.props.what} could not be drawn.</p>
        <p className="mt-1">
          Your record is safe — this is a fault in the page, not in what you
          saved. The rest of Good Earth still works; pick another view and come
          back.
        </p>
        <p className="mt-2 font-mono text-[11px] opacity-70">{this.state.message}</p>
      </div>
    );
  }
}
