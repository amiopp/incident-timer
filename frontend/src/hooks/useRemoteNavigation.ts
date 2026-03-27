import { useEffect, useMemo, useRef, useState } from "react";

export type RemoteMode = "direct" | "navigation";

type UseRemoteNavigationOptions = {
  enabled: boolean;
  mode: RemoteMode;
  targetIds: string[];
  onPrimaryAction: () => void;
  onSecureResolveAction: () => void;
  onBackAction?: () => void;
};

function getElementsByTargetIds(targetIds: string[]) {
  return targetIds
    .map((targetId) => document.querySelector<HTMLElement>(`[data-remote-id="${targetId}"]`))
    .filter((item): item is HTMLElement => item !== null && !item.hasAttribute("disabled"));
}

export function useRemoteNavigation({
  enabled,
  mode,
  targetIds,
  onPrimaryAction,
  onSecureResolveAction,
  onBackAction,
}: UseRemoteNavigationOptions) {
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(null);
  const resolveConfirmUntilRef = useRef<number>(0);

  const orderedTargetIds = useMemo(() => [...targetIds], [targetIds]);

  useEffect(() => {
    if (!enabled || mode !== "navigation") {
      setFocusedTargetId(null);
      return;
    }

    const elements = getElementsByTargetIds(orderedTargetIds);
    if (elements.length === 0) return;

    const first = elements[0];
    first.focus();
    setFocusedTargetId(first.dataset.remoteId ?? null);
  }, [enabled, mode, orderedTargetIds]);

  useEffect(() => {
    if (!enabled) return;

    function cycleFocus(next: boolean) {
      const elements = getElementsByTargetIds(orderedTargetIds);
      if (elements.length === 0) return;

      const activeElement = document.activeElement as HTMLElement | null;
      const currentIndex = elements.findIndex((element) => element === activeElement);
      const fallbackIndex = focusedTargetId
        ? elements.findIndex((element) => element.dataset.remoteId === focusedTargetId)
        : -1;
      const startIndex = currentIndex >= 0 ? currentIndex : fallbackIndex >= 0 ? fallbackIndex : 0;
      const nextIndex = next
        ? (startIndex + 1) % elements.length
        : (startIndex - 1 + elements.length) % elements.length;

      elements[nextIndex].focus();
      setFocusedTargetId(elements[nextIndex].dataset.remoteId ?? null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      const activeElement = document.activeElement as HTMLElement | null;
      const isTextInput = activeElement?.tagName === "TEXTAREA" || 
                         (activeElement?.tagName === "INPUT" && (activeElement as HTMLInputElement).type === "text");

      if (mode === "direct") {
        if (event.key === "Enter") {
          if (!isTextInput) {
            event.preventDefault();
            onPrimaryAction();
          }
          return;
        }

        if (event.key === " ") {
          if (!isTextInput) {
            event.preventDefault();
            onPrimaryAction();
          }
          return;
        }

        if (event.key.toLowerCase() === "r") {
          if (!isTextInput) {
            event.preventDefault();
            const now = Date.now();
            if (resolveConfirmUntilRef.current > now) {
              onSecureResolveAction();
              resolveConfirmUntilRef.current = 0;
            } else {
              resolveConfirmUntilRef.current = now + 2000;
            }
          }
          return;
        }

        if (event.key === "Escape") {
          onBackAction?.();
        }

        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        cycleFocus(true);
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        cycleFocus(false);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        if (!isTextInput && activeElement) {
          event.preventDefault();
          activeElement.click();
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onBackAction?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, mode, orderedTargetIds, focusedTargetId, onPrimaryAction, onSecureResolveAction, onBackAction]);

  return {
    focusedTargetId,
    clearFocusedTargetId: () => setFocusedTargetId(null),
  };
}
