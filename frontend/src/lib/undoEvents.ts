// Telling the rest of the app that the undo stack moved.
//
// Two events, and the pair is the point. A page pushes onto the stack when it
// removes a row, so the mark in the header learns it has something to offer.
// The mark puts a row back, so whatever page is open learns to re-read.
//
// The second one is new, and it is what lets the mark live in the header at
// all. It used to be a bar on four pages, each handed an `onRestored` closure
// that re-read that page's own record — which is why a page could only offer
// back the kinds it could then show. In the header there is no page to close
// over, so the news has to travel.
//
// A lib module and not a component, because `blockItems` subscribes and a hook
// may not import a `.tsx`. Not `undo.ts` either: that file is deliberately
// free of the DOM so its tests run under the plain node runner, where `window`
// does not exist.

import { push } from "./undo";

/// A row was removed and is now offerable.
export const UNDO_EVENT = "goodearth:undo";

/// A row was put back. Whatever is on screen should read its record again.
export const RESTORED_EVENT = "goodearth:restored";

/// Record a removal and tell any mark on screen.
///
/// Synchronous on purpose: a page that removes a row and re-renders in the
/// same tick must find the entry already there, or the offer it just earned
/// appears one interaction late.
export function remembered(e: Parameters<typeof push>[0]) {
  push(e);
  window.dispatchEvent(new Event(UNDO_EVENT));
}

/// Say that something came back.
export function restored() {
  window.dispatchEvent(new Event(RESTORED_EVENT));
}
