import * as React from "react";
import { Input } from "@/components/ui/input";

export interface StreetNameInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "ref"> {
  value: string;
  onChange: (value: string) => void;
  /** Previously-saved street names used to predict the rest of the text. */
  suggestions: string[];
}

/**
 * <Input> wrapper with INLINE predictive autocomplete for street names.
 *
 * As the user types, the first matching suggestion (case-insensitive prefix)
 * is filled into the box and the predicted continuation is selected. The next
 * keystroke replaces the selection (because the browser does that natively for
 * selected text), Backspace clears it, Escape dismisses it, ArrowRight / Tab
 * accept it. No dropdown — the prediction lives inside the input itself.
 */
export const StreetNameInput = React.forwardRef<HTMLInputElement, StreetNameInputProps>(
  ({ value, onChange, suggestions, onKeyDown, ...rest }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const setRefs = (el: HTMLInputElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
      }
    };

    // After we extend the value with a prediction we need to select the
    // newly-inserted portion. We can't do that during render because the DOM
    // value reflects the previous state — schedule it for the next layout.
    const pendingSelection = React.useRef<{ start: number; end: number } | null>(null);

    React.useLayoutEffect(() => {
      const pending = pendingSelection.current;
      if (pending && innerRef.current) {
        try {
          innerRef.current.setSelectionRange(pending.start, pending.end);
        } catch {
          // Some input types (e.g. type=number) throw on setSelectionRange; ignore.
        }
        pendingSelection.current = null;
      }
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const native = e.nativeEvent as InputEvent;
      // Only autocomplete on real typing — not paste, delete, IME composition.
      const isInsertText =
        !native.inputType || native.inputType === "insertText";
      const input = e.target;
      const newVal = input.value;
      const cursorPos = input.selectionStart ?? newVal.length;

      if (isInsertText && suggestions.length > 0) {
        // What the user has actually typed up to the cursor.
        const typedPortion = newVal.slice(0, cursorPos);
        if (typedPortion) {
          const lower = typedPortion.toLowerCase();
          const match = suggestions.find(
            (s) => s.length > typedPortion.length && s.toLowerCase().startsWith(lower),
          );
          if (match) {
            pendingSelection.current = { start: cursorPos, end: match.length };
            onChange(match);
            return;
          }
        }
      }
      pendingSelection.current = null;
      onChange(newVal);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const input = innerRef.current;
      // Escape dismisses the completion, keeping only what the user typed.
      if (
        input &&
        e.key === "Escape" &&
        input.selectionStart !== input.selectionEnd
      ) {
        e.preventDefault();
        const typed = input.value.slice(0, input.selectionStart ?? 0);
        onChange(typed);
        return;
      }
      onKeyDown?.(e);
    };

    return (
      <Input
        ref={setRefs}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        {...rest}
      />
    );
  },
);
StreetNameInput.displayName = "StreetNameInput";
