// App-wide confirmation dialogs — replaces the browser's native window.confirm()
// so every destructive/important action shares one on-brand, compact modal
// instead of the default Google/Chrome "localhost:5173 says…" box.
//
// Usage anywhere under <ConfirmProvider> (mounted once at the app root):
//
//   const confirm = useConfirm();
//   const ok = await confirm({
//     title: "Delete “Senior Frontend Developer”?",
//     message: "This removes the vacancy. Candidates already in it are not deleted.",
//     confirmLabel: "Delete",
//     tone: "danger",           // "danger" (default) | "primary"
//   });
//   if (!ok) return;            // user cancelled
//
// The call returns a Promise<boolean> that resolves true on confirm, false on
// cancel / backdrop click / Escape.
import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

const ConfirmContext = createContext(null);

const DEFAULTS = {
  title: "Are you sure?",
  message: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  tone: "danger", // most confirms are destructive; opt into "primary" otherwise
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { ...options } while open, else null
  const resolver = useRef(null);

  const close = useCallback((result) => {
    if (resolver.current) {
      resolver.current(result);
      resolver.current = null;
    }
    setState(null);
  }, []);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setState({ ...DEFAULTS, ...options });
    });
  }, []);

  // Escape cancels, Enter confirms — keyboard parity with a native dialog.
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  const danger = state?.tone === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/50" onClick={() => close(false)} />
          <div className="relative z-10 w-full max-w-[380px] rounded-2xl bg-card p-6 shadow-pop">
            <div className="flex gap-4">
              <div
                className={
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
                  (danger ? "bg-red-100 text-red-600" : "bg-secondary text-foreground")
                }
              >
                <Icon size={22} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-foreground">{state.title}</h3>
                {state.message && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{state.message}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <Button variant="ghost" onClick={() => close(false)}>
                {state.cancelLabel}
              </Button>
              <Button variant={danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
                {state.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Returns an async confirm({ title, message, confirmLabel, cancelLabel, tone }).
// Throws if used outside the provider so a missing mount fails loudly, not silently.
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
